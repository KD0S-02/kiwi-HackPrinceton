import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, desktopCapturer, globalShortcut, ipcMain, nativeImage, screen, session, shell, systemPreferences } from "electron";
import { uIOhook, UiohookKey } from "uiohook-napi";
import { AssemblyAI, StreamingTranscriber } from "assemblyai";
import { ask, primeCache } from "../../scripts/ask.ts";
import { requiredEnv } from "../../scripts/load-env.ts";
import { lookupUser } from "../../scripts/lookup-user.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const keyterms = [
  "Fieldnote",
  "Harbor Diner",
  "Send Quote",
  "Alex Morgan",
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
    followTimer = setTimeout(() => {
      followCursor = true;
      showOnOverlay("follow", true);
    }, 7000);
  }
}

async function warmCache() {
  try {
    primeCache(await lookupUser("user"), [
      { source: "discount-policy.md", text: "An account executive may discount up to 15 percent and may send a quote on their own opportunities." },
      { source: "sending-a-quote.md", text: "Send Quote is on the Opportunity header next to the discount field." },
    ]);
  } catch (error) {
    send("answer", error instanceof Error ? error.message : String(error));
  }
}

async function captureScreen() {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  panel.hide();
  overlay.hide();
  await new Promise((resolve) => setTimeout(resolve, 180));
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: 1024, height: 640 },
  });
  const source = sources.find((item) => item.display_id === String(display.id)) ?? sources[0];
  panel.showInactive();
  if (!source || source.thumbnail.isEmpty()) {
    throw new Error("Screen Recording is off for Electron. Turn it on in System Settings, then ask again.");
  }
  overlay.showInactive();
  const image = source.thumbnail;
  const size = image.getSize();
  return {
    base64: image.toJPEG(60).toString("base64"),
    width: size.width,
    height: size.height,
    display,
  };
}

async function answerQuestion(question: string) {
  const current = ++runId;
  transcript = "";
  send("status", { busy: true, label: "Looking" });
  send("partial", question);
  point(null);
  try {
    const shot = await captureScreen();
    if (current !== runId) return;
    const prior = history.slice(-4).join("\n");
    const asked = prior ? `Earlier:\n${prior}\n\n${question}` : question;
    const result = await ask({ question: asked, imagePngBase64: shot.base64, imageMime: "image/jpeg" });
    if (current !== runId) return;
    const stop = result.stops[0];
    if (!stop) throw new Error("Kiwi did not return a stop.");
    const screenX = shot.display.bounds.x + (stop.x / shot.width) * shot.display.bounds.width;
    const screenY = shot.display.bounds.y + (stop.y / shot.height) * shot.display.bounds.height;
    overlay.setBounds(shot.display.bounds);
    const placed = overlay.getBounds();
    overlay.showInactive();
    point({ x: screenX - placed.x, y: screenY - placed.y, say: stop.say });
    send("answer", stop.say);
    history.push(`User: ${question}`, `Kiwi: ${stop.say}`);
  } catch (error) {
    if (current !== runId) return;
    send("answer", error instanceof Error ? error.message : String(error));
  } finally {
    if (current === runId) send("status", { busy: false, label: "Ready" });
  }
}

async function startTalking() {
  if (listening) return;
  transcript = "";
  listening = true;
  send("listening", true);
  send("status", { busy: true, label: "Listening" });
  if (listenTimer) clearTimeout(listenTimer);
  listenTimer = setTimeout(() => void stopTalking(), 30_000);
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
  transcriber = next;
  transcriberOpen = false;
  pendingAudio = [];
  try {
    await next.connect();
  } catch (error) {
    listening = false;
    transcriber = undefined;
    pendingAudio = [];
    send("listening", false);
    send("status", { busy: false, label: "Ready" });
    throw error;
  }
  if (transcriber !== next) {
    await next.close();
    return;
  }
  transcriberOpen = true;
  for (const chunk of pendingAudio) sendAudioSafely(next, chunk);
  pendingAudio = [];
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

async function stopTalking() {
  if (listenTimer) clearTimeout(listenTimer);
  if (!listening) return;
  listening = false;
  send("listening", false);
  const current = transcriber;
  transcriber = undefined;
  await closeTranscriber(current);
  const question = transcript.trim();
  if (!question) {
    send("status", { busy: false, label: "Ready" });
    send("partial", "No words came through.");
    return;
  }
  await answerQuestion(question);
}

async function cancelTalking() {
  if (listenTimer) clearTimeout(listenTimer);
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
    send("answer", "Control + Option is on.");
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
    height: 168,
    x: panelPosition.x,
    y: panelPosition.y,
    type: "panel",
    frame: false,
    transparent: true,
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
    webPreferences: { preload: path.join(here, "preload.cjs"), contextIsolation: true, nodeIntegration: false },
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
  ipcMain.on("fit", (_event, height: number) => {
    if (panel.isDestroyed()) return;
    const next = Math.max(140, Math.min(340, Math.round(height)));
    const bounds = panel.getBounds();
    if (bounds.height !== next) panel.setSize(bounds.width, next);
  });
  globalShortcut.register("Escape", () => {
    runId += 1;
    point(null);
    void cancelTalking();
  });
  ipcMain.handle("ask", (_event, question: string) => answerQuestion(question));
  ipcMain.handle("talk-start", () => startTalking());
  ipcMain.handle("talk-stop", () => stopTalking());
  ipcMain.handle("talk-cancel", () => cancelTalking());
  ipcMain.on("audio", (_event, bytes: ArrayBuffer) => {
    if (!listening || !transcriber) return;
    const chunk = Buffer.from(bytes);
    if (!transcriberOpen) {
      if (pendingAudio.length < 100) pendingAudio.push(chunk);
      return;
    }
    sendAudioSafely(transcriber, chunk);
  });
  const icon = nativeImage.createFromPath(path.join(here, "kiwi.png"));
  if (!icon.isEmpty()) app.dock.setIcon(icon);
  watchKeys();
  watchCursor();
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
