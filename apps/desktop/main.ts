import { execFile } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, clipboard, desktopCapturer, globalShortcut, ipcMain, nativeImage, screen, session, shell, systemPreferences } from "electron";
import { uIOhook, UiohookKey } from "uiohook-napi";
import { AssemblyAI, StreamingTranscriber } from "assemblyai";
import { ask, clearSignedIn, primeCache, type Stop } from "../../scripts/ask.ts";
import { askPage, pageInFront, pagePath, startBridge } from "./bridge.ts";
import { ensureFieldnote, fieldnoteUrl } from "./fieldnote.ts";
import { route } from "./router.ts";
import { prepareStops, stillToDo } from "./steps.ts";
import { adjustOwner, personByEmail, personById, type Person } from "../fieldnote/lib/people.ts";
import { activateApp, chromeTabs, frontWindow, openChromeTab, openChromeUrl, prefetchChromeTabs } from "./chrome.ts";
import { requiredEnv } from "../../scripts/load-env.ts";
import { lookupUser } from "../../scripts/lookup-user.ts";
import { dataDirectory } from "../../scripts/paths.ts";
import { createRecorder, nameRun } from "./record.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const keyterms = [
  "Fieldnote",
  "Harbor Diner",
  "Send Quote",
  "Krishna Das",
  "Shail Shah",
  "Sparsh Bohra",
  "Priya Shah",
  "Discount",
  "fryer oil",
  "Newark dry goods",
  "Jersey City",
];

let panel: BrowserWindow;
let overlay: BrowserWindow;
let transcriber: StreamingTranscriber | undefined;
let transcriberOpen = false;
let pendingAudio: Buffer[] = [];
let listenTimer: NodeJS.Timeout | undefined;
let listening = false;
let activePress = 0;
let stoppedPress = 0;
let talkGeneration = 0;
let transcript = "";
let runId = 0;
let followCursor = true;
let followTimer: NodeJS.Timeout | undefined;
const history: string[] = [];
const heldKeys = new Set<number>();
const modifierKeys = new Set<number>([
  UiohookKey.Ctrl,
  UiohookKey.CtrlRight,
  UiohookKey.Alt,
  UiohookKey.AltRight,
  UiohookKey.Meta,
  UiohookKey.MetaRight,
  UiohookKey.Shift,
  UiohookKey.ShiftRight,
]);
let shortcutHeld = false;
let shortcutUsesCommand = false;
let keysWatching = false;

function holding(codes: number[]) {
  return codes.some((code) => heldKeys.has(code));
}

function send(channel: string, payload: unknown) {
  if (!panel.isDestroyed()) panel.webContents.send(channel, payload);
  if (channel === "status" && !overlay.isDestroyed()) overlay.webContents.send(channel, payload);
}

function showOnOverlay(channel: string, payload: unknown) {
  if (!overlay.isDestroyed()) overlay.webContents.send(channel, payload);
}

function point(payload: { x: number; y: number; say: string } | null) {
  if (followTimer) clearTimeout(followTimer);
  followCursor = payload === null;
  showOnOverlay("point", payload);
  if (payload) {
    returnToCursor(4500);
  }
}

function returnToCursor(delayMs: number) {
  if (followTimer) clearTimeout(followTimer);
  followTimer = setTimeout(() => {
    followCursor = true;
    if (!overlay.isDestroyed()) {
      overlay.showInactive();
      overlay.moveTop();
    }
    showOnOverlay("follow", true);
  }, delayMs);
}

const knownPages = [
  { source: "discount-policy.md", text: "An account executive may discount up to 15 percent and may send a quote on their own opportunities." },
  { source: "sending-a-quote.md", text: "Send Quote is on the Opportunity header next to the discount field." },
];
let sessionPerson: Person | null = null;

function sessionFile() {
  return path.join(app.getPath("userData"), "session.json");
}

function sessionPayload(person: Person | null) {
  return person ? { name: person.name, role: person.role, email: person.email } : null;
}

async function activatePerson(person: Person) {
  sessionPerson = person;
  writeFileSync(sessionFile(), JSON.stringify({ id: person.id }));
  primeCache(await lookupUser(person.id), knownPages);
  send("session", sessionPayload(person));
}

async function signIn(email: string) {
  const found = personByEmail(email);
  if ("error" in found) return { ok: false as const, error: found.error };
  const already = sessionPerson?.id === found.person.id;
  runId += 1;
  await activatePerson(found.person);
  void openChromeUrl(`${fieldnoteUrl}/api/login?email=${encodeURIComponent(found.person.email)}`).catch(() => undefined);
  return { ok: true as const, already, ...sessionPayload(found.person)! };
}

async function signOut() {
  if (!sessionPerson) return { ok: true as const };
  sessionPerson = null;
  writeFileSync(sessionFile(), "{}");
  clearSignedIn();
  runId += 1;
  void cancelTalking();
  recorder.stop();
  send("session", null);
  send("answer", "");
  void openChromeUrl(`${fieldnoteUrl}/api/logout`).catch(() => undefined);
  return { ok: true as const };
}

async function warmCache() {
  try {
    const saved = JSON.parse(readFileSync(sessionFile(), "utf8")) as { id?: string };
    const person = saved.id ? personById(saved.id) : undefined;
    if (!person) return;
    await activatePerson(person);
  } catch {
    // No one is signed in yet.
  }
}

// The app the user is working in. Kiwi's own window does not count, so a question typed
// into Kiwi still knows it is about the PDF or email behind it.
let lastFront = { app: "", title: "" };

async function updateFront() {
  const front = await frontWindow();
  if (front.app && !/^(kiwi|electron)$/i.test(front.app)) lastFront = front;
  return lastFront;
}

function watchFront() {
  setInterval(() => void updateFront(), 2000);
}

const screenWords = /\b(this|these|that|here|screen|pdf|docs?|document|file|e-?mail|mail|inbox|message|thread|sheet|spreadsheet|slides?|deck|written|says?|said|read|summar\w*|tl;?dr|reply|respond|draft|rewrite|edit|translate|explain|paste|insert|write)\b/i;

async function captureScreen() {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const scale = Math.min(display.scaleFactor, 1600 / display.size.width);
  const panelWasVisible = panel.isVisible();
  panel.hide();
  overlay.hide();
  await wait(160);
  try {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: Math.round(display.size.width * scale), height: Math.round(display.size.height * scale) },
    });
    const source = sources.find((item) => item.display_id === String(display.id)) ?? sources[0];
    if (!source || source.thumbnail.isEmpty()) return undefined;
    return source.thumbnail.toJPEG(75).toString("base64");
  } catch {
    return undefined;
  } finally {
    if (panelWasVisible) panel.showInactive();
    overlay.showInactive();
  }
}

const recorder = createRecorder({
  directory: path.join(dataDirectory, "runs"),
  look: () => ({ where: pagePath() || lastFront.title, app: lastFront.app, title: lastFront.title }),
  shoot: () => captureScreen(),
  onState: (state) => send("record", state),
});

const inputHelper = path.join(here, "input", "kiwi-input");

function runInput(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    execFile(inputHelper, args, (error) => (error ? reject(error) : resolve()));
  });
}

async function pasteDraft(stop: Stop) {
  const text = stop.text || stop.note || "";
  if (!text) {
    send("answer", stop.say);
    return;
  }
  clipboard.writeText(text);
  if (!stop.allow) {
    send("answer", "It's copied. Press Command-V where you want it.");
    return;
  }
  if (lastFront.app) await activateApp(lastFront.app);
  await wait(300);
  try {
    await runInput(["paste"]);
    send("answer", stop.say || `Pasted it into ${lastFront.app || "the app in front"}.`);
  } catch {
    send("answer", "It's copied. Press Command-V where you want it.");
  }
}

function refusal(stop: Stop) {
  if (!stop.allow) return "";
  if (stop.kind === "click" && /confirm-delete/i.test(stop.target)) {
    return "I opened it, but deleting is your call. Press Delete if you're sure.";
  }
  if (stop.kind === "type" && /discount/i.test(`${stop.label} ${stop.target}`) && Number(stop.text) > 15) {
    const approver = sessionPerson?.approverName || "You";
    return `I won't type a discount over 15. ${approver} has to approve that.`;
  }
  return "";
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function screenContext() {
  const [page, tabs] = await Promise.all([askPage({ op: "inventory" }, 400), chromeTabs()]);
  const lines: string[] = [];
  if (tabs.length > 0) {
    lines.push(`BROWSER TABS ${JSON.stringify(tabs.map((tab) => tab.title))}`);
  }
  const controls = page?.ok ? page.controls ?? [] : [];
  if (controls.length > 0) {
    const listed = controls.map((control) => ({
      id: control.id || undefined,
      label: control.label,
      ...(control.disabled ? { disabled: true } : {}),
      ...(control.value ? { value: control.value } : {}),
      ...(control.options ? { options: control.options } : {}),
    }));
    lines.push(`PAGE CONTROLS on Fieldnote ${page?.path} ${JSON.stringify(listed)}`);
    if (page?.facts?.length) lines.push(`PAGE TEXT ${JSON.stringify(page.facts)}`);
  } else {
    lines.push("FIELDNOTE IS NOT OPEN. kiwi opens it for you. start with a url: stop for the page that has what they want.");
  }
  return { text: lines.join("\n"), controls, tabs, facts: page?.ok ? page.facts ?? [] : [] };
}

function overlayPoint(screenX: number, screenY: number) {
  const display = screen.getDisplayNearestPoint({ x: Math.round(screenX), y: Math.round(screenY) });
  const bounds = overlay.getBounds();
  if (bounds.x !== display.bounds.x || bounds.y !== display.bounds.y || bounds.width !== display.bounds.width) {
    overlay.setBounds(display.bounds);
  }
  overlay.showInactive();
  const placed = overlay.getBounds();
  return { x: screenX - placed.x, y: screenY - placed.y };
}

// "Show me open cases" is not "show me my open cases". The model reads "me" as mine, so
// an owner filter stays only when the question says whose records it wants.
function ownerTarget(question: string, target: string) {
  return sessionPerson ? adjustOwner(question, target, sessionPerson) : target;
}

// A written answer stays in Kiwi's window. It pastes only when asked, and it leaves the
// current app only when the question asks to open or show something.
function keepWritingHere(question: string, stop: Stop): Stop {
  const askedToPaste = /\b(paste|insert|type (it|this)|put (it|this)|write (it|this) (in|into|there|here)|fill)\b/i.test(question);
  if (stop.target === "paste" && !askedToPaste) {
    return { ...stop, kind: "show", allow: false, target: "none", note: stop.note || stop.text };
  }
  // A draft stays in the window. Asking to also open, click, go home, or filter still navigates.
  const writingOnly = /\b(draft|rewrite|summarize|summary|reply|poem)\b/i.test(question)
    && !/\b(open|show|take|go|find|click|back|home|logo|page|filter|where|pull|bring)\b/i.test(question);
  if (stop.note && writingOnly && /^(url|tab):/i.test(stop.target ?? "")) {
    return { ...stop, kind: "show", allow: false, target: "none" };
  }
  return stop;
}

function urlOf(target: string) {
  const path = target.replace(/^url:/i, "").trim();
  return path.startsWith("/") ? path : `/${path}`;
}

async function playStop(stop: Stop) {
  const fly = (screenX: number, screenY: number, say = stop.say) => {
    point({ ...overlayPoint(screenX, screenY), say });
    send("answer", say);
  };
  const doing = stop.allow && stop.kind !== "show";
  const blocked = refusal(stop);
  const target = stop.target.trim();

  if (stop.note) send("note", stop.note);
  if (!target || target === "none") {
    send("answer", stop.say);
    return;
  }
  if (target === "paste") {
    await pasteDraft(stop);
    return;
  }

  if (/^tab:/i.test(target)) {
    send("answer", stop.say);
    if (!doing || blocked) {
      if (blocked) send("answer", blocked);
      await wait(1200);
      return;
    }
    const opened = await openChromeTab(target).catch((error: Error) => {
      send("answer", `Chrome would not switch tabs: ${error.message}. Allow Kiwi to control Google Chrome in Privacy & Security, Automation.`);
      return "";
    });
    if (!opened && /fieldnote/i.test(target)) {
      const problem = await ensureFieldnote("/", (text) => send("answer", text));
      if (problem) send("answer", problem);
    } else if (!opened) {
      send("answer", `I could not find a tab called ${target.slice(4)}.`);
    }
    returnToCursor(600);
    return;
  }

  const problem = await ensureFieldnote(/^url:/i.test(target) ? urlOf(target) : "/", (text) => send("answer", text));
  if (problem) {
    send("answer", problem);
    return;
  }

  if (/^url:/i.test(target)) {
    send("answer", stop.say);
    const opened = await askPage({ op: "navigate", url: urlOf(target) }, 6500);
    if (!opened?.ok) {
      send("answer", opened?.error ?? "Fieldnote did not open that page.");
      return;
    }
    let spot = await askPage({ op: "locate", target: "filters" }, 600);
    if (!spot?.ok) spot = await askPage({ op: "locate", target: "results" }, 600);
    if (spot?.ok && spot.rect) fly(spot.rect.x, spot.rect.y);
    returnToCursor(2200);
    await wait(1200);
    return;
  }

  const found = await askPage({ op: "locate", target }, 800);
  if (!found?.ok || !found.rect) {
    send("answer", `${stop.say} I couldn't find ${stop.label || target} on this page, though.`);
    return;
  }
  fly(found.rect.x, found.rect.y);
  if (!doing) {
    await wait(1200);
    return;
  }
  if (blocked) {
    send("answer", blocked);
    return;
  }
  await wait(550);
  const done = await askPage({ op: "act", target, kind: stop.kind, text: stop.text }, 800);
  if (!done?.ok) send("answer", done?.error ?? "The page did not answer.");
  returnToCursor(1100);
  await wait(300);
}

async function answerQuestion(question: string) {
  if (!sessionPerson) {
    send("answer", "Sign in with your work email first.");
    return;
  }
  const current = ++runId;
  const started = Date.now();
  transcript = "";
  send("status", { busy: true, label: "Looking" });
  send("partial", question);
  send("note", "");
  point(null);
  try {
    const [context, front] = await Promise.all([screenContext(), updateFront()]);
    if (current !== runId) return;
    const onFieldnote = front.app === "Google Chrome" && pageInFront();
    const aboutScreen = !onFieldnote && screenWords.test(question);
    const quick = aboutScreen ? undefined : route(question, context.controls, context.tabs, context.facts);
    if (quick) {
      await playStop(quick);
      history.push(`User: ${question}`, `Kiwi: ${quick.say}`);
      timing(question, "local", started);
      return;
    }
    const prior = history.slice(-4).join("\n");
    const asked = prior ? `Earlier:\n${prior}\n\n${question}` : question;
    const shot = aboutScreen ? await captureScreen() : undefined;
    if (current !== runId) return;
    const frontLine = front.app ? `FRONT APP ${front.app}${front.title ? ` — ${front.title}` : ""}\n` : "";
    const result = await ask({
      question: asked,
      screenContext: `${frontLine}${shot ? "SCREEN attached\n" : ""}${context.text}`,
      ...(shot ? { imagePngBase64: shot, imageMime: "image/jpeg" as const } : {}),
    });
    if (current !== runId) return;
    if (result.stops.length === 0) throw new Error("Kiwi did not return a stop.");
    let planned = prepareStops(question, result.stops, context.controls);
    for (const stop of planned) {
      if (current !== runId) return;
      await playStop(keepWritingHere(question, { ...stop, target: ownerTarget(question, stop.target ?? "") }));
    }
    // The first reply often only opens the page, because the field is not on it yet.
    // Read the page it landed on and finish the change. Do not wait for "continue".
    for (let round = 0; round < 2 && stillToDo(question, planned) && current === runId; round += 1) {
      const landed = await screenContext();
      const next = await ask({
        question: `${question}\nThe deal is open. Type the discount and click save-discount now. Do not navigate. Do not ask to continue.`,
        screenContext: landed.text,
        mode: "act",
      });
      const more = prepareStops(question, next.stops, landed.controls).filter((stop) => !/^url:/i.test(stop.target));
      if (more.length === 0) break;
      for (const stop of more) {
        if (current !== runId) return;
        await playStop(keepWritingHere(question, { ...stop, target: ownerTarget(question, stop.target ?? "") }));
      }
      planned = [...planned, ...more];
    }
    if (planned.some((stop) => /save-discount/.test(stop.target)) && current === runId) {
      await wait(700);
      const landed = await screenContext();
      const status = (landed.facts ?? []).filter((fact) => fact.id === "quote-message" || fact.id === "readiness").map((fact) => fact.text);
      if (status.length > 0) send("answer", status.join(" "));
    }
    const last = planned.at(-1);
    if (last && /^url:/i.test(last.target ?? "") && /\b(why|where|how|can'?t|cannot)\b/i.test(question) && current === runId) {
      const landed = await screenContext();
      const follow = route(question, landed.controls, landed.tabs, landed.facts);
      if (follow) await playStop(follow);
    }
    const notes = planned.map((stop) => stop.note).filter(Boolean).join("\n").slice(0, 1500);
    history.push(`User: ${question}`, `Kiwi: ${planned.map((stop) => stop.say).join(" ")}${notes ? `\nKiwi wrote: ${notes}` : ""}`);
    timing(question, shot ? "model+screen" : "model", started);
  } catch (error) {
    if (current !== runId) return;
    send("answer", error instanceof Error ? error.message : String(error));
  } finally {
    if (current === runId) send("status", { busy: false, label: "Ready" });
  }
}

function timing(question: string, path: string, started: number) {
  writeFileSync("/tmp/kiwi-timing.log", `${new Date().toISOString()} ${Date.now() - started}ms ${path} ${question}\n`, { flag: "a" });
}

async function finishUtterance(generation: number) {
  if (listenTimer) clearTimeout(listenTimer);
  if (!listening) return;
  listening = false;
  send("listening", false);
  const current = transcriber;
  transcriber = undefined;
  transcriberOpen = false;
  await closeTranscriber(current);
  if (talkGeneration !== generation) return;
  const question = transcript.trim();
  if (!question) {
    send("status", { busy: false, label: "Ready" });
    send("partial", "No words came through.");
    return;
  }
  await answerQuestion(question);
}

async function startTalking(press: number) {
  if (listening) return;
  const generation = ++talkGeneration;
  activePress = press;
  const stopAlready = stoppedPress === press;
  transcript = "";
  listening = true;
  send("listening", true);
  send("status", { busy: true, label: "Listening" });
  if (listenTimer) clearTimeout(listenTimer);
  listenTimer = setTimeout(() => void stopTalking(press), 30_000);
  const client = new AssemblyAI({ apiKey: requiredEnv("ASSEMBLYAI_API_KEY") });
  const next = client.streaming.transcriber({
    sampleRate: 16_000,
    speechModel: "universal-3-6-pro",
    prompt: "An account executive is asking Kiwi about a button or a field in the Fieldnote restaurant-supply CRM.",
    keytermsPrompt: keyterms,
  });
  next.on("turn", (turn) => {
    if (!turn.transcript) return;
    transcript = turn.transcript;
    send("partial", turn.transcript);
  });
  next.on("error", (error) => {
    send("answer", error instanceof Error ? error.message : String(error));
  });
  next.on("close", () => {
    if (transcriber === next) transcriberOpen = false;
  });
  const early = pendingAudio;
  pendingAudio = [];
  transcriber = next;
  transcriberOpen = false;
  try {
    await next.connect();
  } catch (error) {
    if (talkGeneration === generation) {
      listening = false;
      transcriber = undefined;
      pendingAudio = [];
      send("listening", false);
      send("status", { busy: false, label: "Ready" });
    }
    throw error;
  }
  if (talkGeneration !== generation || transcriber !== next) {
    await next.close().catch(() => undefined);
    return;
  }
  transcriberOpen = true;
  for (const chunk of [...early, ...pendingAudio]) sendAudioSafely(next, chunk);
  pendingAudio = [];
  if (stopAlready || stoppedPress === press) await finishUtterance(generation);
}

function sendAudioSafely(target: StreamingTranscriber, chunk: Buffer) {
  try {
    target.sendAudio(chunk);
  } catch {
    transcriberOpen = false;
  }
}

async function closeTranscriber(current: StreamingTranscriber | undefined) {
  transcriberOpen = false;
  pendingAudio = [];
  if (!current) return;
  try {
    await Promise.race([current.close(), new Promise((resolve) => setTimeout(resolve, 1500))]);
  } catch {
    // The socket was already gone; the transcript we have is what we use.
  }
}

async function stopTalking(press: number) {
  if (listenTimer) clearTimeout(listenTimer);
  stoppedPress = press;
  if (!listening || activePress !== press || !transcriberOpen) return;
  await finishUtterance(talkGeneration);
}

async function cancelTalking() {
  if (listenTimer) clearTimeout(listenTimer);
  talkGeneration += 1;
  stoppedPress = activePress;
  listening = false;
  transcript = "";
  send("listening", false);
  const current = transcriber;
  transcriber = undefined;
  await closeTranscriber(current);
  send("status", { busy: false, label: "Ready" });
}

function savedPanelPosition(width: number, height: number) {
  const display = screen.getPrimaryDisplay().workArea;
  const fallback = { x: display.x + display.width - width - 28, y: display.y + 72 };
  try {
    const saved = JSON.parse(readFileSync(path.join(app.getPath("userData"), "panel-position.json"), "utf8")) as { x: number; y: number };
    const visible = screen.getAllDisplays().some((item) => {
      const area = item.workArea;
      return saved.x >= area.x && saved.y >= area.y && saved.x < area.x + area.width - 80 && saved.y < area.y + area.height - 40;
    });
    return visible ? saved : fallback;
  } catch {
    return fallback;
  }
}

function trackShortcut(code: number, pressed: boolean) {
  if (!modifierKeys.has(code)) {
    if (pressed && shortcutHeld && shortcutUsesCommand) {
      shortcutHeld = false;
      shortcutUsesCommand = false;
      send("cancel", true);
    }
    return;
  }
  if (pressed) heldKeys.add(code);
  else heldKeys.delete(code);
  const option = holding([UiohookKey.Alt, UiohookKey.AltRight]);
  const control = holding([UiohookKey.Ctrl, UiohookKey.CtrlRight]);
  const command = holding([UiohookKey.Meta, UiohookKey.MetaRight]);
  const shift = holding([UiohookKey.Shift, UiohookKey.ShiftRight]);
  const next = option && !shift && (control || command) && !(control && command);
  if (next === shortcutHeld) return;
  shortcutHeld = next;
  shortcutUsesCommand = next && command;
  if (next) prefetchChromeTabs();
  send("hold", next);
}

function appBundlePath() {
  return path.resolve(process.execPath, "../../..");
}

function watchKeys() {
  const start = () => {
    if (keysWatching || !systemPreferences.isTrustedAccessibilityClient(false)) return;
    uIOhook.on("keydown", (event) => trackShortcut(event.keycode, true));
    uIOhook.on("keyup", (event) => trackShortcut(event.keycode, false));
    uIOhook.start();
    keysWatching = true;
  };
  if (!systemPreferences.isTrustedAccessibilityClient(true)) {
    send("answer", "A macOS prompt should be asking for Kiwi. In Accessibility, turn on Kiwi. Not Cursor.");
    shell.showItemInFolder(appBundlePath());
  }
  try {
    start();
  } catch (error) {
    send("answer", error instanceof Error ? error.message : "Turn on Kiwi in Accessibility. Not Cursor.");
  }
  const timer = setInterval(() => {
    if (keysWatching) {
      clearInterval(timer);
      return;
    }
    try {
      start();
    } catch {
      clearInterval(timer);
    }
  }, 1500);
}

async function askPermissions() {
  const report = (extra: Record<string, unknown> = {}) => {
    const status = {
      screen: systemPreferences.getMediaAccessStatus("screen"),
      microphone: systemPreferences.getMediaAccessStatus("microphone"),
      accessibility: systemPreferences.isTrustedAccessibilityClient(false),
      exec: process.execPath,
      ...extra,
    };
    writeFileSync("/tmp/kiwi-status.json", JSON.stringify(status, null, 2));
    return status;
  };
  try {
    await systemPreferences.askForMediaAccess("microphone");
    if (systemPreferences.getMediaAccessStatus("screen") !== "granted") {
      await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 1, height: 1 } });
    }
    report();
  } catch (error) {
    const status = report({ error: error instanceof Error ? error.message : String(error) });
    if (status.screen !== "granted") {
      send("answer", "Screen Recording is off for Kiwi. Turn it on in Privacy & Security, then quit and reopen Kiwi.");
    } else if (status.microphone !== "granted") {
      send("answer", "Microphone is off for Kiwi. Turn it on in Privacy & Security.");
    }
  }
}

function watchCursor() {
  setInterval(() => {
    if (!followCursor || overlay.isDestroyed()) return;
    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const bounds = overlay.getBounds();
    if (bounds.x !== display.bounds.x || bounds.y !== display.bounds.y || bounds.width !== display.bounds.width) {
      overlay.setBounds(display.bounds);
    }
    if (!overlay.isVisible()) overlay.showInactive();
    const placed = overlay.getBounds();
    showOnOverlay("cursor", { x: cursor.x - placed.x, y: cursor.y - placed.y });
  }, 32);
}

process.on("uncaughtException", (error) => {
  writeFileSync("/tmp/kiwi-error.log", `${new Date().toISOString()} ${error.stack ?? error.message}\n`, { flag: "a" });
  void cancelTalking();
  send("answer", "Voice dropped. Hold Control + Option to try again.");
});

app.setName("Kiwi");
app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === "media" || permission === "microphone" || permission === "audioCapture");
  });
  const panelWidth = 460;
  const panelPosition = savedPanelPosition(panelWidth, 168);
  panel = new BrowserWindow({
    width: panelWidth,
    height: 280,
    x: panelPosition.x,
    y: panelPosition.y,
    type: "panel",
    frame: false,
    transparent: true,
    hasShadow: false,
    roundedCorners: false,
    backgroundColor: "#00000000",
    alwaysOnTop: true,
    resizable: false,
    movable: true,
    skipTaskbar: false,
    webPreferences: { preload: path.join(here, "preload.cjs"), contextIsolation: true, nodeIntegration: false },
  });
  overlay = new BrowserWindow({
    type: "panel",
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: { preload: path.join(here, "preload.cjs"), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  overlay.setIgnoreMouseEvents(true);
  await panel.loadFile(path.join(here, "panel.html"));
  await overlay.loadFile(path.join(here, "overlay.html"));
  for (const window of [panel, overlay]) {
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    window.setAlwaysOnTop(true, "screen-saver");
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    window.setFullScreenable(false);
  }
  panel.on("moved", () => {
    const bounds = panel.getBounds();
    writeFileSync(path.join(app.getPath("userData"), "panel-position.json"), JSON.stringify({ x: bounds.x, y: bounds.y }));
  });
  ipcMain.on("copy", (_event, text: string) => clipboard.writeText(String(text)));
  ipcMain.on("fit", (_event, height: number) => {
    if (panel.isDestroyed()) return;
    const next = Math.max(140, Math.min(620, Math.round(height)));
    const bounds = panel.getBounds();
    if (bounds.height !== next) panel.setSize(bounds.width, next);
  });
  globalShortcut.register("Escape", () => {
    runId += 1;
    point(null);
    void cancelTalking();
  });
  ipcMain.handle("session", () => sessionPayload(sessionPerson));
  ipcMain.handle("sign-in", (_event, email: string) => signIn(String(email ?? "")));
  ipcMain.handle("sign-out", () => signOut());
  ipcMain.handle("record-start", () => {
    if (!sessionPerson) return { ok: false as const };
    recorder.start({ id: sessionPerson.id, name: sessionPerson.name });
    return { ok: true as const };
  });
  ipcMain.handle("record-pause", () => recorder.pause());
  ipcMain.handle("record-resume", () => recorder.resume());
  ipcMain.handle("record-stop", () => {
    const saved = recorder.stop();
    if (!saved) return { ok: false as const };
    return { ok: true as const, id: saved.id, beats: saved.beats.length };
  });
  ipcMain.handle("record-name", (_event, id: string, title: string, note: string) => {
    const cleanId = String(id ?? "");
    const cleanTitle = String(title ?? "").trim();
    if (!/^run-[a-z0-9]+$/.test(cleanId) || !cleanTitle) return { ok: false as const };
    try {
      nameRun(path.join(dataDirectory, "runs"), cleanId, cleanTitle, String(note ?? "").trim());
    } catch {
      return { ok: false as const };
    }
    return { ok: true as const };
  });
  ipcMain.handle("ask", (_event, question: string) => answerQuestion(question));
  ipcMain.handle("talk-start", (_event, press: number) => {
    if (!sessionPerson) {
      send("answer", "Sign in with your work email first.");
      return;
    }
    return startTalking(Number(press) || 0);
  });
  ipcMain.handle("talk-stop", (_event, press: number) => stopTalking(Number(press) || activePress));
  ipcMain.handle("talk-cancel", () => cancelTalking());
  ipcMain.on("audio", (_event, bytes: ArrayBuffer) => {
    if (!listening) return;
    const chunk = Buffer.from(bytes);
    if (!transcriber || !transcriberOpen) {
      if (pendingAudio.length < 200) pendingAudio.push(chunk);
      return;
    }
    sendAudioSafely(transcriber, chunk);
  });
  const icon = nativeImage.createFromPath(path.join(here, "kiwi.png"));
  if (!icon.isEmpty()) app.dock.setIcon(icon);
  startBridge();
  watchKeys();
  watchCursor();
  watchFront();
  void askPermissions();
  void warmCache();
  if (process.env.KIWI_SHOT) {
    setTimeout(async () => {
      writeFileSync("/tmp/kiwi-panel.png", (await panel.capturePage()).toPNG());
      const cursor = screen.getCursorScreenPoint();
      const placed = overlay.getBounds();
      const cropX = Math.max(0, Math.round(cursor.x - placed.x - 20));
      const cropY = Math.max(0, Math.round(cursor.y - placed.y - 10));
      writeFileSync("/tmp/kiwi-bird.png", (await overlay.capturePage({ x: cropX, y: cropY, width: 90, height: 80 })).toPNG());
    }, 900);
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  if (keysWatching) uIOhook.stop();
  void closeTranscriber(transcriber);
});
app.on("window-all-closed", () => app.quit());
