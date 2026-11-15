import { execFile } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, clipboard, desktopCapturer, globalShortcut, ipcMain, nativeImage, screen, session, shell, systemPreferences } from "electron";
import { uIOhook, UiohookKey } from "uiohook-napi";
import { AssemblyAI, StreamingTranscriber } from "assemblyai";
import { ask, clearSignedIn, primeCache, type Stop } from "../../scripts/ask.ts";
import { askPage, onPageAction, onPageHover, pageInFront, pagePath, startBridge } from "./bridge.ts";
import { ensureFieldnote } from "./fieldnote.ts";
import { route } from "./router.ts";
import { StepBuffer, accountPageReady, accountRequest, accountSlug, accountStillToDo, discountOf, goalReached, onboardingSubmit, prepareStops, quoteRequest, quoteStillToDo, stepAligned } from "./steps.ts";
import { adjustOwner, personByEmail, personById, type Person } from "../fieldnote/lib/people.ts";
import { nav } from "../fieldnote/lib/data.ts";
import { activateApp, chromeTabs, frontWindow, openChromeTab, prefetchChromeTabs } from "./chrome.ts";
import { requiredEnv } from "../../scripts/load-env.ts";
import { knownPath, placesIn } from "../../scripts/site-map.ts";
import { lookupUser } from "../../scripts/lookup-user.ts";
import { dataDirectory } from "../../scripts/paths.ts";
import { createRecorder, nameRun } from "./record.ts";
import { compileSkill, describeStep, findSkill, listSkills, saveSkill, type Skill } from "./skills.ts";

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
// Each pause starts a new turn. Keep them all so a long question is not cut to its last words.
let turns = new Map<number, string>();
let runId = 0;
const howToQuestion = /^\s*(how (do|can|should|would|to)\b|how'?s\b|what (do|should) i\b|what'?s the (best )?way\b|what steps\b)/i;
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

let trail: string[] = [];
let holdingTrail = false;

function point(payload: { x: number; y: number; say: string; look?: "arrow" | "hand" } | null) {
  if (followTimer) clearTimeout(followTimer);
  followCursor = payload === null;
  showOnOverlay("point", payload);
  if (payload && !holdingTrail && payload.look !== "arrow") returnToCursor(4500);
}

function pushStep(line: string) {
  if (!line || trail[trail.length - 1] === line) return;
  trail.push(line);
  holdingTrail = true;
  if (followTimer) clearTimeout(followTimer);
  followCursor = false;
  send("step", line);
}

function pushSummary(line: string) {
  if (!line) return;
  send("summary", line);
}

// The window keeps the steps. The arrow and its card leave when the task is done.
function releasePointer() {
  holdingTrail = false;
  point(null);
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
  const [page, tabs] = await Promise.all([askPage({ op: "inventory" }, 1500), chromeTabs()]);
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
  return { text: lines.join("\n"), controls, tabs, facts: page?.ok ? page.facts ?? [] : [], path: page?.ok ? page.path ?? "" : "" };
}

// The checklist polls the open page only. Scanning Chrome tabs on every check is what makes a long run feel stuck.
async function readPage() {
  const page = await askPage({ op: "inventory" }, 1200);
  const controls = page?.ok ? page.controls ?? [] : [];
  return { text: "", controls, tabs: [] as { title: string; url: string }[], facts: page?.ok ? page.facts ?? [] : [], path: page?.path || pagePath() };
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

const pageNames: Record<string, string> = {
  "/": "Home",
  "/orders": "Fulfillment",
  "/supply": "Supply",
  "/accounts": "Accounts",
  "/pipeline": "Pipeline",
  "/approvals": "Approvals",
  "/cases": "Cases",
  "/company": "Company",
  "/products": "Products",
  "/purchase-orders": "Purchase orders",
};

function words(value: string) {
  const text = decodeURIComponent(value).replace(/\+/g, " ").replace(/-/g, " ");
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function pageName(pathname: string) {
  if (pageNames[pathname]) return pageNames[pathname];
  const piece = pathname.split("/").filter(Boolean).pop() ?? "that page";
  return piece.replace(/-/g, " ");
}

function isAction(stop: Stop) {
  const target = stop.target.trim();
  return Boolean(stop.allow && target && target !== "none" && target !== "paste" && stop.kind !== "show");
}

// What this step did, in the window. Not the model's say, which restates the request.
function told(stop: Stop) {
  const target = stop.target.trim();
  if (/^url:/i.test(target)) {
    const [pathname, query = ""] = urlOf(target).split("?");
    const name = pageName(pathname);
    const params = [...new URLSearchParams(query).entries()];
    if (params.length === 0) return `Opened ${name}.`;
    const sets = params.map(([key, value]) => `${key.replace(/Id$/, "")} to ${words(value)}`).join(" and ");
    return `Opened ${name} and set ${sets}.`;
  }
  if (/^tab:/i.test(target)) return `Switched to ${target.slice(4).trim()}.`;
  const name = (stop.label || target).replace(/^filter-/, "").replace(/-/g, " ");
  if (stop.kind === "type") return `Entered ${stop.text} in ${name}.`;
  return `Clicked ${name}.`;
}

// The result, once. It must not be the step lines again.
function wrapUp(question: string, played: Stop[]) {
  if (quoteRequest(question) && quoteStillToDo(question, played)) return "";
  if (quoteRequest(question)) return "The quote is sent. It's on Quotes.";
  if (accountRequest(question) && accountStillToDo(question, played)) {
    const created = played.some((stop) => stop.target === "new-account-submit");
    const continued = played.some((stop) => /^(add-buyer|add-ap-contact|confirm-territory|set-price-book|set-delivery-days|set-tax|apply-credit|activate-account)/.test(stop.target));
    if (created && !continued) return "The restaurant is created. The checklist on the next page did not open, so I stopped.";
    return "";
  }
  const actions = played.filter(isAction);
  if (actions.length === 0) return "";
  const last = actions[actions.length - 1];
  if (last.say?.trim().endsWith("?")) return "";
  if (played.some((stop) => stop.target === "activate-account-submit")) return "The restaurant is active and can take orders.";
  const note = [...played].reverse().find((stop) => stop.kind === "show" && stop.say?.trim());
  if (note?.say && accountRequest(question)) {
    const line = note.say.trim();
    return /[.!?]$/.test(line) ? line : `${line}.`;
  }
  if (/^url:/i.test(last.target)) {
    const [pathname, query = ""] = urlOf(last.target).split("?");
    const params = [...new URLSearchParams(query).entries()];
    const warehouse = params.find(([key]) => key === "warehouse")?.[1];
    if (pathname === "/orders" && warehouse) return `These are the orders from ${words(warehouse)}.`;
    if (pathname === "/supply" && warehouse) return `This is the stock at ${words(warehouse)}.`;
    if (params.length === 0) return `You're on ${pageName(pathname)} now.`;
    return `You're on ${pageName(pathname)}, with that filter on.`;
  }
  if (last.kind === "type") return "The fields are filled in.";
  if (/new-account-submit/.test(last.target)) return "The restaurant is set up and can take orders.";
  if (/submit|save/i.test(last.target)) return "That's saved.";
  if (/^approve-/.test(last.target)) return "That's approved.";
  if (/^reject-/.test(last.target)) return "That's rejected.";
  return "That's done.";
}

function narration(stop: Stop) {
  if (/^url:/i.test(stop.target.trim())) return told(stop);
  const say = stop.say?.trim() ?? "";
  if (say) return /[.!?]$/.test(say) ? say : `${say}.`;
  return told(stop);
}

async function playStop(stop: Stop) {
  const line = narration(stop);
  const fly = (screenX: number, screenY: number) => {
    const action = isAction(stop);
    point({ ...overlayPoint(screenX, screenY), say: action ? line : stop.say, ...(action ? { look: "arrow" as const } : {}) });
  };
  const doing = stop.allow && stop.kind !== "show";
  const blocked = refusal(stop);
  const target = stop.target.trim();

  if (stop.note) send("note", stop.note);
  if (!target || target === "none") {
    if (stop.kind === "show") return true;
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

  if (/^url:/i.test(target) && !knownPath(urlOf(target))) {
    send("answer", `Fieldnote has no ${urlOf(target).split("?")[0]} page.`);
    return;
  }
  const problem = await ensureFieldnote(/^url:/i.test(target) ? urlOf(target) : "/", (text) => send("answer", text));
  if (problem) {
    send("answer", problem);
    return;
  }

  if (/^url:/i.test(target)) {
    const opened = await askPage({ op: "navigate", url: urlOf(target) }, 22000);
    if (!opened?.ok) {
      pushStep(opened?.error ?? "Fieldnote did not open that page.");
      return false;
    }
    // A filtered URL points at that filter. A plain page open does not point at the bar.
    let spot: Awaited<ReturnType<typeof askPage>> | undefined;
    const query = urlOf(target).split("?")[1] ?? "";
    for (const key of new URLSearchParams(query).keys()) {
      spot = await askPage({ op: "locate", target: `filter-${key}` }, 500);
      if (spot?.ok && spot.rect) break;
      spot = undefined;
    }
    if (query && !spot?.ok) spot = await askPage({ op: "locate", target: "results" }, 600);
    if (spot?.ok && spot.rect) fly(spot.rect.x, spot.rect.y);
    pushStep(line);
    await wait(1200);
    return true;
  }

  const found = await askPage({ op: "locate", target }, 800);
  if (!found?.ok || !found.rect) {
    pushStep(`Couldn't find ${stop.label || target} on this page.`);
    return false;
  }
  fly(found.rect.x, found.rect.y);
  if (!doing) {
    send("answer", stop.say);
    await wait(1200);
    return;
  }
  if (blocked) {
    pushStep(blocked);
    return;
  }
  await wait(550);
  const done = await askPage({ op: "act", target, kind: stop.kind, text: stop.text }, 800);
  if (!done?.ok) {
    pushStep(done?.error ?? "The page did not answer.");
    return false;
  }
  pushStep(line);
  await wait(300);
  return true;
}

// Each step's say is shown alone, so "Then, click Save." reads as a fragment.
function ownSentence(say: string) {
  const trimmed = say.trim().replace(/^(and then|then|next|after that|finally|now),?\s+/i, "");
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function chainPrompt(question: string, played: Stop[], rejected?: Stop) {
  const done = played.map((stop) => stop.say || `${stop.kind} ${stop.target}`).filter(Boolean).join("; ") || "nothing yet";
  const wrong = rejected
    ? `\nThe step ${rejected.kind} ${rejected.target} is not on this page. Clear that plan. Use the PAGE CONTROLS below.`
    : "";
  return `${question}\n\nAlready done: ${done}.${wrong}\nPlan at most 3 stops. If the request is already finished, one stop with target none.`;
}

async function closeDialog() {
  const found = await askPage({ op: "locate", target: "dialog-close" }, 500);
  if (!found?.ok) return;
  await askPage({ op: "act", target: "dialog-close", kind: "click" }, 800);
  await wait(250);
}

// A submit click returns before the save finishes. Wait until the dialog closes, or the page says why it refused.
async function afterOnboardingSubmit(target: string) {
  let page = await readPage();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const error = page.facts.find((fact) => fact.id === "form-error")?.text ?? "";
    if (error) return { page, refused: error };
    const open = page.controls.some((control) => (control.id ?? "").toLowerCase() === target.toLowerCase());
    if (!open) return { page, refused: "" };
    await wait(120);
    page = await readPage();
  }
  const error = page.facts.find((fact) => fact.id === "form-error")?.text ?? "";
  return { page, refused: error || (page.controls.length === 0 ? "" : "That step did not save.") };
}

async function waitUntilGone(id: string, page: Awaited<ReturnType<typeof readPage>>) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (page.controls.length === 0) {
      await wait(120);
      page = await readPage();
      continue;
    }
    const still = page.controls.some((control) => (control.id ?? "").toLowerCase() === id && !control.disabled);
    if (!still) return page;
    await wait(120);
    page = await readPage();
  }
  return page;
}

async function waitForControl(id: string) {
  let page = await readPage();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const ready = id
      ? page.controls.some((control) => (control.id ?? "").toLowerCase() === id)
      : page.controls.length > 0;
    if (ready) return page;
    await wait(150);
    page = await readPage();
  }
  return page;
}

async function waitForDeal() {
  const started = Date.now();
  while (Date.now() - started < 4000) {
    if (pagePath().split("?")[0].startsWith("/opportunities/")) break;
    await wait(100);
  }
  return waitForControl("tab-products");
}

async function waitForSavedDiscount(question: string) {
  const wanted = discountOf(question);
  let page = await readPage();
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const fact = page.facts.find((item) => item.id === "saved-discount")?.text ?? "";
    if (wanted && fact.toLowerCase().includes(`discount ${wanted}%`)) return page;
    await wait(150);
    page = await readPage();
  }
  return page;
}

async function waitForSentQuote() {
  let page = await readPage();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const sent = page.facts.some((fact) => (fact.id === "latest-quote" || fact.id === "quote-message") && /^quote sent\b/i.test(fact.text.trim()));
    if (sent && /tab=quotes/.test(page.path)) return page;
    await wait(150);
    page = await readPage();
  }
  return page;
}

async function waitForNewAccount(question: string) {
  const slug = accountSlug(question);
  const started = Date.now();
  while (Date.now() - started < 3500) {
    const path = pagePath().split("?")[0];
    if (slug && (path === `/accounts/${slug}` || path.startsWith(`/accounts/${slug}-`))) break;
    await wait(100);
  }
  let page = await readPage();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (accountPageReady(question, page.controls, page.facts, page.path || pagePath())) return page;
    await wait(150);
    page = await readPage();
  }
  return page;
}

async function runChain(
  question: string,
  asked: string,
  page: Awaited<ReturnType<typeof screenContext>>,
  shot: string | undefined,
  current: number,
) {
  const buffer = new StepBuffer();
  const played: Stop[] = [];
  const failed = new Set<string>();
  let rejected: Stop | undefined;
  let plans = 0;
  let blanks = 0;
  const handsOn = accountRequest(question) || quoteRequest(question);
  while (current === runId && plans < 3 && played.length < 40) {
    if (goalReached(question, played, buffer.pending === 0)) break;
    if (buffer.pending === 0) {
      if (handsOn && page.controls.length === 0 && blanks < 4) {
        blanks += 1;
        await wait(180);
        page = await readPage();
        continue;
      }
      blanks = 0;
      const local = prepareStops(question, played, page.controls, page.facts, page.path).filter(
        (stop) => !failed.has(stop.target) && !played.some((done) => done.kind === stop.kind && done.target === stop.target && done.text === stop.text),
      );
      if (handsOn) {
        if (local.length > 0) {
          buffer.push(local);
          continue;
        }
        break;
      }
      if (local.some((stop) => stop.target === "new-account" || stop.target.startsWith("new-account-"))) {
        buffer.push(local);
        continue;
      }
      const follow = !rejected && played.length > 0 ? route(question, page.controls, page.tabs, page.facts) : undefined;
      if (follow && stepAligned(follow, page.controls) && !played.some((stop) => stop.target === follow.target && stop.kind === follow.kind)) {
        buffer.push([follow]);
        continue;
      }
      plans += 1;
      if (plans > 1) send("status", { busy: true, label: "Next step" });
      const result = await ask({
        question: plans === 1 && !rejected ? asked : chainPrompt(question, played, rejected),
        screenContext: page.text,
        ...(shot && plans === 1 ? { imagePngBase64: shot, imageMime: "image/jpeg" as const } : {}),
      });
      if (current !== runId) return played;
      rejected = undefined;
      const stops = prepareStops(question, result.stops, page.controls, page.facts, page.path)
        .slice(0, 3)
        .map((stop) => keepWritingHere(question, { ...stop, say: ownSentence(stop.say ?? ""), target: ownerTarget(question, stop.target ?? "") }))
        .filter((stop) => !failed.has(stop.target) && !played.some((done) => done.kind === stop.kind && done.target === stop.target && done.text === stop.text));
      if (stops.length === 0) {
        if (played.length === 0) throw new Error("Kiwi did not return a stop.");
        break;
      }
      buffer.push(stops);
      continue;
    }
    const step = buffer.takeNext();
    if (!step) continue;
    if (/^url:/i.test(step.target)) {
      const [pathname, query = ""] = urlOf(step.target).split("?");
      if (!query && pagePath().split("?")[0] === pathname) {
        played.push(step);
        continue;
      }
    }
    if (!stepAligned(step, page.controls)) {
      // The address can change before the new page's buttons are in the inventory.
      for (let attempt = 0; attempt < (handsOn ? 12 : 1) && !stepAligned(step, page.controls); attempt += 1) {
        await wait(150);
        page = handsOn ? await readPage() : await screenContext();
      }
      if (!stepAligned(step, page.controls)) {
        failed.add(step.target);
        buffer.clear();
        rejected = step;
        if (quoteRequest(question)) pushStep(`Couldn't find ${step.label || step.target} on this page.`);
        continue;
      }
    }
    const did = await playStop(step);
    if (current !== runId) return played;
    if (did === false) {
      failed.add(step.target);
      buffer.clear();
      // A quote step that misses would add the wrong product. An account step can move on.
      if (quoteRequest(question)) break;
      if (accountRequest(question)) continue;
      break;
    }
    if (onboardingSubmit(step.target) || step.target === "add-product-submit" || step.target === "new-opportunity-submit") {
      const outcome = await afterOnboardingSubmit(step.target);
      page = outcome.page;
      if (outcome.refused) {
        pushStep(outcome.refused);
        failed.add(step.target);
        failed.add(step.target.replace(/-submit$/, ""));
        buffer.clear();
        await closeDialog();
        page = await readPage();
        continue;
      }
      page = step.target === "new-opportunity-submit" ? await waitForDeal() : await waitUntilGone(step.target.replace(/-submit$/, ""), page);
    } else if (handsOn) {
      if (step.target === "new-account-submit") page = await waitForNewAccount(question);
      else if (step.target === "save-discount") page = await waitForSavedDiscount(question);
      else if (step.target === "send-quote") page = await waitForSentQuote();
      else if (step.target === "new-opportunity") page = await waitForControl("new-opportunity-submit");
      else if (step.target === "add-product") page = await waitForControl("add-product-submit");
      else if (/^url:/i.test(step.target) && quoteRequest(question)) page = await waitForControl("new-opportunity");
      else if (step.target.startsWith("deal-") || step.target === "tab-products" || step.target === "tab-quotes") page = await waitForControl("");
      else page = await readPage();
    } else {
      page = await screenContext();
      if (step.target === "new-account-submit") page = await waitForNewAccount(question);
      else if (/^(add-buyer|add-ap-contact|confirm-territory|set-price-book|set-delivery-days|set-tax|apply-credit|activate-account)$/.test(step.target)) {
        for (let attempt = 0; attempt < 5 && !page.controls.some((control) => (control.id ?? "").toLowerCase() === `${step.target}-submit`); attempt += 1) {
          await wait(80);
          page = await readPage();
        }
      }
    }
    played.push(step);
    if (goalReached(question, played, buffer.pending === 0)) {
      buffer.clear();
      break;
    }
  }
  return played;
}

const skillsDirectory = path.join(dataDirectory, "skills");
const skillWords = /\b(skill|skills|recorded|recording|guide|walk|teach|show me how|how do i|run|replay)\b/i;

// Walks through a saved skill on the real page: opens each page and points at each control.
async function playSkill(skill: Skill, current: number) {
  const author = skill.authorId === sessionPerson?.id ? "you" : skill.authorName;
  send("answer", `Here's "${skill.title}", recorded by ${author}. ${skill.steps.length} steps.`);
  send("note", [skill.note, ...skill.steps.map((step, index) => `${index + 1}. ${describeStep(step, index === 0, nav)}`)].filter(Boolean).join("\n"));
  for (const [index, step] of skill.steps.entries()) {
    if (current !== runId) return;
    point(null);
    if (step.kind === "page") {
      if (!knownPath(step.path)) continue;
      const problem = await ensureFieldnote(step.path, (text) => send("answer", text));
      if (problem) {
        send("answer", problem);
        return;
      }
      const opened = await askPage({ op: "navigate", url: step.path }, 22000);
      if (!opened?.ok) {
        send("answer", `I could not open ${step.path}.`);
        return;
      }
      send("answer", `${describeStep(step, index === 0, nav)}.`);
      await wait(1600);
      continue;
    }
    if (step.path && pagePath() !== step.path && knownPath(step.path)) {
      await askPage({ op: "navigate", url: step.path }, 22000);
      await wait(500);
    }
    const say = `${describeStep(step, index === 0, nav)}.`;
    const found = await askPage({ op: "locate", target: step.target }, 800) ?? undefined;
    const spot = found?.ok ? found : await askPage({ op: "locate", target: step.label }, 800);
    if (spot?.ok && spot.rect) point({ ...overlayPoint(spot.rect.x, spot.rect.y), say });
    send("answer", spot?.ok ? say : `${say} I can't see it on this page.`);
    await wait(2200);
  }
  if (current === runId && skill.end && pagePath() !== skill.end && knownPath(skill.end)) {
    await askPage({ op: "navigate", url: skill.end }, 22000);
  }
  if (current === runId) {
    returnToCursor(400);
    send("answer", `That's all of "${skill.title}".`);
  }
}

const blockedWords = /approv|sign off|can'?t|cannot|not allowed|isn'?t allowed|switched off|doesn'?t (have|exist|track)|does not (have|exist|track)|no such/i;

// A how-to answer that only explained something he is allowed to do. Kiwi offers to do it.
// Options Kiwi asked him to pick from, each with the request to run when picked.
function choicesIn(stops: Stop[]) {
  return stops.flatMap((stop) => stop.choices ?? [])
    .map((choice) => ({ label: String(choice.label ?? "").trim().slice(0, 32), ask: String(choice.ask ?? "").trim() }))
    .filter((choice) => choice.label && choice.ask)
    .slice(0, 3);
}

const missingWords = /\b(doesn'?t|does not) (have|exist|track)|\bthere(?: is|'s) no\b|\bno such\b|\bisn'?t a\b/i;

function sendOffer(question: string, stops: Stop[], doIt: boolean) {
  if (doIt) return;
  if (offerable(question, stops, doIt)) {
    send("offer", { question });
    return;
  }
  let choices = choicesIn(stops);
  const said = stops.map((stop) => stop.say).join(" ");
  if (choices.length === 0 && missingWords.test(said)) {
    choices = placesIn(said).slice(0, 3).map((place) => ({ label: `Open ${place.name}`, ask: `take me to ${place.name}` }));
  }
  if (choices.length > 0) send("offer", { choices });
}

function offerable(question: string, stops: Stop[], doIt: boolean) {
  if (doIt || !howToQuestion.test(question)) return false;
  if (stops.some((stop) => blockedWords.test(`${stop.say} ${stop.note ?? ""}`))) return false;
  if (stops.some((stop) => stop.offer === false || stop.say.trim().endsWith("?"))) return false;
  if (stops.some((stop) => stop.allow && (stop.kind === "type" || /^save|submit|send|approve|create/i.test(stop.target ?? "")))) return false;
  if (stops.some((stop) => stop.offer === true)) return true;
  if (stops.some((stop) => stop.allow && stop.kind !== "show" && !/^(url|tab):/i.test(stop.target ?? ""))) return false;
  return stops.some((stop) => stop.kind === "show" && !/^(none|paste)?$/i.test((stop.target ?? "").trim()));
}

async function answerQuestion(question: string, doIt = false) {
  if (!sessionPerson) {
    send("answer", "Sign in with your work email first.");
    return;
  }
  const current = ++runId;
  const started = Date.now();
  transcript = "";
  send("status", { busy: true, label: "Looking" });
  send("partial", question);
  send("answer", "");
  send("note", "");
  send("offer", "");
  trail = [];
  holdingTrail = false;
  point(null);
  try {
    const skills = listSkills(skillsDirectory);
    if (!doIt && /\b(what|which|list|any|my|saved)\b.*\bskills?\b|\bskills?\b.*\b(saved|recorded|have)\b/i.test(question) && !findSkill(skills, question)) {
      send("answer", skills.length ? `There ${skills.length === 1 ? "is 1 saved skill" : `are ${skills.length} saved skills`}.` : "There are no saved skills yet. Press record to make one.");
      if (skills.length) send("note", skills.map((skill) => `- ${skill.title} (${skill.authorId === sessionPerson.id ? "you" : skill.authorName}, ${skill.steps.length} steps)`).join("\n"));
      timing(question, "skills", started);
      return;
    }
    const skill = !doIt && skillWords.test(question) ? findSkill(skills, question) : undefined;
    if (skill) {
      await playSkill(skill, current);
      history.push(`User: ${question}`, `Kiwi: walked through the saved skill "${skill.title}".`);
      timing(question, "skill", started);
      return;
    }
    const [context, front] = await Promise.all([screenContext(), updateFront()]);
    if (current !== runId) return;
    const onFieldnote = front.app === "Google Chrome" && pageInFront();
    const aboutScreen = !doIt && !onFieldnote && screenWords.test(question);
    const quick = aboutScreen || doIt ? undefined : route(question, context.controls, context.tabs, context.facts);
    if (quick) {
      await playStop(quick);
      if (current === runId) pushSummary(wrapUp(question, [quick]));
      if (current === runId) releasePointer();
      history.push(`User: ${question}`, `Kiwi: ${quick.say}`);
      timing(question, "local", started);
      if (current === runId) sendOffer(question, [quick], doIt);
      return;
    }
    const prior = history.slice(-4).join("\n");
    const request = doIt
      ? `${question}\nHe already read how to do this and said yes. Do it for him now. Use click and type stops with allow true on real controls: open the page with a url: stop, then click or fill what is needed. Do not explain again and do not use a show stop unless nothing on Fieldnote can do it. Stop before anything that sends, deletes, or confirms.`
      : question;
    const asked = prior ? `Earlier, already answered. Use it only for context:\n${prior}\n\nAnswer this new question only:\n${request}` : request;
    const shot = aboutScreen ? await captureScreen() : undefined;
    if (current !== runId) return;
    const frontLine = front.app ? `FRONT APP ${front.app}${front.title ? ` — ${front.title}` : ""}\n` : "";
    const played = await runChain(question, asked, { text: `${frontLine}${shot ? "SCREEN attached\n" : ""}${context.text}`, controls: context.controls, tabs: context.tabs, facts: context.facts }, shot, current);
    if (played.some((stop) => /save-discount/.test(stop.target)) && current === runId) {
      await wait(700);
      const landed = await screenContext();
      const status = (landed.facts ?? []).filter((fact) => fact.id === "quote-message" || fact.id === "readiness").map((fact) => fact.text);
      if (status.length > 0) send("answer", status.join(" "));
    }
    if (current === runId) pushSummary(wrapUp(question, played));
    if (current === runId) releasePointer();
    const notes = played.map((stop) => stop.note).filter(Boolean).join("\n").slice(0, 1500);
    history.push(`User: ${question}`, `Kiwi: ${played.map((stop) => stop.say).join(" ")}${notes ? `\nKiwi wrote: ${notes}` : ""}`);
    timing(question, shot ? "model+screen" : "model", started);
    if (current === runId) sendOffer(question, played, doIt);
  } catch (error) {
    if (current !== runId) return;
    send("answer", plainError(error));
  } finally {
    if (current === runId) send("status", { busy: false, label: "Ready" });
  }
}

// Model and network errors are long and technical. Say what happened in one line.
function plainError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/429|quota|RESOURCE_EXHAUSTED|rate.?limit/i.test(message)) return "Kiwi is out of model requests for now. Try again in a little while.";
  if (/503|UNAVAILABLE|high demand|overloaded/i.test(message)) return "The model is busy right now. Try again in a moment.";
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(message)) return "Kiwi can't reach the model. Check your internet connection.";
  if (/did not return a stop/i.test(message)) return "I couldn't work that one out. Try asking another way.";
  return message;
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
  turns = new Map();
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
    turns.set(turn.turn_order, turn.transcript);
    transcript = [...turns.entries()].sort((a, b) => a[0] - b[0]).map(([, text]) => text.trim()).join(" ");
    send("partial", transcript);
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

const arrowSteps: Record<number, [number, number]> = {
  [UiohookKey.ArrowLeft]: [-1, 0],
  [UiohookKey.ArrowRight]: [1, 0],
  [UiohookKey.ArrowUp]: [0, -1],
  [UiohookKey.ArrowDown]: [0, 1],
};

// Holding Command and pressing an arrow nudges the panel. Not shown anywhere in the UI.
function nudgePanel(code: number) {
  const step = arrowSteps[code];
  if (!step || panel.isDestroyed() || !panel.isVisible()) return;
  if (!holding([UiohookKey.Meta, UiohookKey.MetaRight])) return;
  const bounds = panel.getBounds();
  const area = screen.getDisplayNearestPoint({ x: bounds.x + bounds.width / 2, y: bounds.y + 20 }).workArea;
  const x = Math.max(area.x - bounds.width + 80, Math.min(area.x + area.width - 80, bounds.x + step[0] * 24));
  const y = Math.max(area.y, Math.min(area.y + area.height - 60, bounds.y + step[1] * 24));
  panel.setPosition(x, y);
  writeFileSync(path.join(app.getPath("userData"), "panel-position.json"), JSON.stringify({ x, y }));
}

type Modifiers = { altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean };

// A key-up can get lost (Command-Tab, secure fields). Every event carries the real modifier state, so drop stale keys.
function syncModifiers(flags: Modifiers) {
  const groups: [boolean, number[]][] = [
    [flags.altKey, [UiohookKey.Alt, UiohookKey.AltRight]],
    [flags.ctrlKey, [UiohookKey.Ctrl, UiohookKey.CtrlRight]],
    [flags.metaKey, [UiohookKey.Meta, UiohookKey.MetaRight]],
    [flags.shiftKey, [UiohookKey.Shift, UiohookKey.ShiftRight]],
  ];
  for (const [down, codes] of groups) if (!down) for (const code of codes) heldKeys.delete(code);
}

function trackShortcut(code: number, pressed: boolean, flags?: Modifiers) {
  if (pressed) nudgePanel(code);
  if (flags) syncModifiers(flags);
  if (!modifierKeys.has(code)) {
    if (pressed && shortcutHeld && shortcutUsesCommand) {
      shortcutHeld = false;
      shortcutUsesCommand = false;
      send("cancel", true);
      return;
    }
    updateHold();
    return;
  }
  if (pressed) heldKeys.add(code);
  else heldKeys.delete(code);
  updateHold();
}

function updateHold() {
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
    uIOhook.on("keydown", (event) => trackShortcut(event.keycode, true, event));
    uIOhook.on("keyup", (event) => trackShortcut(event.keycode, false, event));
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
  ipcMain.handle("session", () => sessionPayload(sessionPerson));
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
  globalShortcut.register("CommandOrControl+\\", () => {
    if (panel.isDestroyed()) return;
    if (panel.isVisible()) panel.hide();
    else panel.showInactive();
  });
  globalShortcut.register("Escape", () => {
    runId += 1;
    point(null);
    void cancelTalking();
    send("escape", true);
  });
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
      const run = nameRun(path.join(dataDirectory, "runs"), cleanId, cleanTitle, String(note ?? "").trim());
      const skill = compileSkill(run);
      if (skill.steps.length > 0) saveSkill(skillsDirectory, skill);
      return { ok: true as const, steps: skill.steps.length };
    } catch {
      return { ok: false as const };
    }
  });
  ipcMain.handle("record-discard", (_event, id: string) => {
    const cleanId = String(id ?? "");
    if (!/^run-[a-z0-9]+$/.test(cleanId)) return { ok: false as const };
    rmSync(path.join(dataDirectory, "runs", cleanId), { recursive: true, force: true });
    return { ok: true as const };
  });
  ipcMain.handle("ask", (_event, question: string) => answerQuestion(question));
  ipcMain.handle("do-it", (_event, question: string) => answerQuestion(String(question), true));
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
  onPageAction((step) => recorder.action(step));
  onPageHover((over) => showOnOverlay("hover", over));
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
