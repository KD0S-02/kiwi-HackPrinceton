import { askPage, pageInFront, pageIsOpen, pagePath, pageUrl, waitForPage } from "./bridge.ts";
import { focusChromeUrl, navigateChromeTab, openChromeUrl, reloadChromeTab } from "./chrome.ts";

export const fieldnoteUrl = (process.env.FIELDNOTE_URL ?? "http://localhost:3000").replace(/\/$/, "");

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fieldnoteServerUp(base = fieldnoteUrl) {
  try {
    const response = await fetch(`${base}/login`, { redirect: "manual", signal: AbortSignal.timeout(2000) });
    return response.status < 500;
  } catch {
    return false;
  }
}

// Puts a live, signed-in Fieldnote page in front, whatever state Chrome is in: on another
// desktop, behind another tab or app, minimized, discarded by Chrome, closed, or Chrome not
// running. Returns what to tell the user when it cannot, or "" when the page is ready.
export async function ensureFieldnote(path = "/", say: (text: string) => void = () => {}, base = fieldnoteUrl): Promise<string> {
  const host = new URL(base).host;
  const live = pageIsOpen() ? new URL(pageUrl()) : undefined;
  const focused = (live && (await focusChromeUrl(live.host + live.pathname))) || (await focusChromeUrl(host));
  if (focused === "moved") await wait(450);
  let ready = Boolean(focused) && (await waitForPage(2500, () => pageInFront()));
  if (focused && !ready) {
    say("Waking up the Fieldnote tab…");
    await reloadChromeTab(host);
    ready = await waitForPage(6000, () => pageInFront());
  }
  if (!ready) {
    if (!(await fieldnoteServerUp(base))) return `Fieldnote isn't running at ${base}. Start it with npm run dev, then ask again.`;
    say("Opening Fieldnote…");
    try {
      if (!(await navigateChromeTab(host, `${base}${path}`))) await openChromeUrl(`${base}${path}`);
    } catch (error) {
      return `I couldn't open Chrome: ${error instanceof Error ? error.message : String(error)}`;
    }
    if (!(await waitForPage(12000, () => pageInFront()))) return "Chrome opened Fieldnote, but the page didn't connect. Reload it once, then ask again.";
    await wait(500);
  }
  if (pagePath().startsWith("/login")) {
    say("Signing you in to Fieldnote…");
    await askPage({ op: "act", target: "Sign in", kind: "click" }, 1500);
    if (!(await waitForPage(8000, (current) => !current.startsWith("/login")))) return "Sign in to Fieldnote, then ask again.";
    await wait(400);
  }
  return "";
}
