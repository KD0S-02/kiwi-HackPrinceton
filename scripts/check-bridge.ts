import { spawn } from "node:child_process";
import { askPage, pageIsOpen, startBridge } from "../apps/desktop/bridge.ts";

const server = startBridge();
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless=new",
  "--disable-gpu",
  `--user-data-dir=/tmp/kiwi-bridge-chrome-${Date.now()}`,
  "--window-size=1400,900",
  "--remote-debugging-port=9399",
  "about:blank",
], { stdio: "ignore" });

async function openPage(url: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:9399/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
      if (response.ok) return;
    } catch {
      // Chrome is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Chrome did not start");
}

async function waitFor(check: () => boolean, ms: number) {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > ms) throw new Error("timed out");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

try {
  await openPage("http://localhost:3000/login");
  await waitFor(pageIsOpen, 15000);
  const login = await askPage({ op: "inventory" });
  console.log("login page controls", login?.controls?.map((control) => control.id || control.label));
  const signIn = await askPage({ op: "act", target: "Sign in", kind: "click" });
  console.log("click Sign in", signIn?.ok, signIn?.error ?? "");
  await new Promise((resolve) => setTimeout(resolve, 2500));
  await waitFor(pageIsOpen, 10000);
  const home = await askPage({ op: "inventory" });
  console.log("after sign in", home?.path, home?.controls?.length, "controls");
  const open = await askPage({ op: "act", target: "Open the opportunity", kind: "click" });
  console.log("click Open the opportunity", open?.ok, open?.error ?? "");
  await new Promise((resolve) => setTimeout(resolve, 2500));
  await waitFor(pageIsOpen, 10000);
  const deal = await askPage({ op: "inventory" });
  console.log("now on", deal?.path, deal?.controls?.filter((control) => control.id).map((control) => `${control.id}${control.disabled ? " (off)" : ""}`));
  const send = await askPage({ op: "locate", target: "send-quote" });
  console.log("locate send-quote", send?.ok, send?.rect);
  const press = await askPage({ op: "act", target: "send-quote", kind: "click" });
  console.log("press send-quote", press?.ok, press?.error ?? "");
} catch (error) {
  console.log("failed", error instanceof Error ? error.message : error);
} finally {
  chrome.kill("SIGKILL");
  server.close();
  process.exit(0);
}
