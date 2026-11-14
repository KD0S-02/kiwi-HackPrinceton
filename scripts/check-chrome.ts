import { execFile } from "node:child_process";
import { askPage, pageIsOpen, startBridge, waitForPage } from "../apps/desktop/bridge.ts";
import { ensureFieldnote, fieldnoteUrl } from "../apps/desktop/fieldnote.ts";

// Moves your real Chrome into awkward states and checks Kiwi gets Fieldnote back in front.
// Quit Kiwi first; it holds port 4555. Needs /tmp/kiwi-test.pdf (any PDF works).
const pdf = "file:///tmp/kiwi-test.pdf";
const host = new URL(fieldnoteUrl).host;
const server = startBridge();
let failures = 0;

function osa(script: string) {
  return new Promise<string>((resolve) => {
    execFile("/usr/bin/osascript", ["-e", script], { timeout: 5000 }, (error, stdout, stderr) => resolve(error ? `ERROR ${stderr.trim()}` : stdout.trim()));
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function state() {
  const front = await osa('tell application "System Events" to name of first process whose frontmost is true');
  const url = await osa('tell application "Google Chrome" to URL of active tab of front window');
  const minimized = await osa('tell application "Google Chrome" to minimized of front window');
  return { front, url, minimized };
}

async function scenario(name: string, setup: () => Promise<void>, path = "/", expect = (now: Awaited<ReturnType<typeof state>>, said: string) => now.front === "Google Chrome" && now.url.includes(host) && now.minimized === "false" && said === "") {
  await setup();
  await sleep(1200);
  const before = await state();
  const started = Date.now();
  const notes: string[] = [];
  const said = await ensureFieldnote(path, (text) => notes.push(text));
  const now = await state();
  const ok = expect(now, said);
  if (!ok) failures += 1;
  console.log(`${ok ? "pass" : "FAIL"} ${name} (${Date.now() - started}ms)\n     before: ${before.front} · ${before.url.slice(0, 50)}\n     after:  ${now.front} · ${now.url.slice(0, 50)}${said ? ` · said "${said}"` : ""}${notes.length ? ` · steps: ${notes.join(" / ")}` : ""}`);
}

const newTab = (url: string) => osa(`tell application "Google Chrome" to tell front window to make new tab with properties {URL:"${url}"}`);
const closeTabs = (part: string) => osa(`tell application "Google Chrome"
  repeat with w in windows
    repeat with i from (count of tabs of w) to 1 by -1
      if URL of tab i of w contains "${part}" then close tab i of w
    end repeat
  end repeat
end tell`);

try {
  await waitForPage(4000);
  await scenario("start: Fieldnote ready in Chrome", async () => {});

  await scenario("a PDF tab is in front of Fieldnote", async () => {
    await newTab(pdf);
  });

  await scenario("Preview has a PDF open in front", async () => {
    await osa('do shell script "open -a Preview /tmp/kiwi-test.pdf"');
  });

  await scenario("another app (Finder) is in front", async () => {
    await osa('tell application "Finder" to activate');
  });

  await scenario("Chrome window with Fieldnote is minimized", async () => {
    await osa('tell application "Google Chrome" to set minimized of front window to true');
  });

  await scenario("a second Chrome window with a PDF is in front", async () => {
    await osa(`tell application "Google Chrome"
      make new window
      set URL of active tab of front window to "${pdf}"
    end tell`);
  });

  const spaces = await osa('tell application "System Events" to key code 124 using control down');
  if (spaces.startsWith("ERROR")) {
    console.log("skip moved to the next desktop (System Events cannot press keys from here)");
  } else {
    await scenario("switched to the next desktop", async () => {});
  }

  await scenario("signed out of Fieldnote", async () => {
    await askPage({ op: "navigate", url: "/profile" }, 6000);
    await askPage({ op: "act", target: "Log out", kind: "click" }, 2000);
    await waitForPage(6000, (path) => path.startsWith("/login"));
  });

  await closeTabs(host);
  await sleep(1500);
  console.log(`closed every Fieldnote tab; bridge still sees a page: ${pageIsOpen()}`);
  const down = await ensureFieldnote("/", () => {}, "http://localhost:3999");
  check("server down message", down.includes("isn't running"), down);

  await scenario("every Fieldnote tab is closed (opens /pipeline)", async () => {}, "/pipeline");
  const page = await askPage({ op: "inventory" }, 2000);
  check("new tab opened on the asked page", Boolean(page?.path?.startsWith("/pipeline")), page?.path ?? "");
} catch (error) {
  failures += 1;
  console.log("failed", error instanceof Error ? error.message : error);
} finally {
  await closeTabs("kiwi-test.pdf");
  await osa('tell application "Preview" to quit');
  server.close();
  console.log(failures === 0 ? "all passed" : `${failures} failed`);
  process.exit(failures === 0 ? 0 : 1);
}

function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "pass" : "FAIL"} ${name}${detail ? ` | ${detail}` : ""}`);
}
