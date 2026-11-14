import { spawn } from "node:child_process";
import { askPage, pageIsOpen, startBridge } from "../apps/desktop/bridge.ts";

// Drives Fieldnote in headless Chrome through Kiwi's page bridge: URL filters, filter
// controls, and the create, edit and delete dialogs. Quit Kiwi first; it holds port 4555.
// Only the headless browser counts, so a Fieldnote tab in your own Chrome is never touched.
process.env.KIWI_BRIDGE_ONLY = "HeadlessChrome";
const server = startBridge();
const chrome = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless=new",
  "--disable-gpu",
  `--user-data-dir=/tmp/kiwi-crm-chrome-${Date.now()}`,
  "--window-size=1400,900",
  "--remote-debugging-port=9398",
  "about:blank",
], { stdio: "ignore" });

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let failures = 0;

function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "pass" : "FAIL"} ${name}${detail ? ` | ${detail}` : ""}`);
}

async function openPage(url: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:9398/json/new?${encodeURIComponent(url)}`, { method: "PUT" });
      if (response.ok) return;
    } catch {
      // Chrome is still starting.
    }
    await sleep(200);
  }
  throw new Error("Chrome did not start");
}

async function waitFor(check: () => boolean, ms: number) {
  const started = Date.now();
  while (!check()) {
    if (Date.now() - started > ms) throw new Error("timed out");
    await sleep(100);
  }
}

async function page() {
  const reply = await askPage({ op: "inventory" }, 2000);
  return {
    path: reply?.path ?? "",
    count: reply?.facts?.find((fact) => fact.id === "filter-count")?.text ?? "",
    controls: reply?.controls ?? [],
  };
}

try {
  await openPage("http://localhost:3000/login");
  await waitFor(pageIsOpen, 15000);
  await askPage({ op: "act", target: "Sign in", kind: "click" }, 3000);
  await sleep(3500);
  await waitFor(pageIsOpen, 10000);

  let went = await askPage({ op: "navigate", url: "/pipeline?owner=all&stage=Proposal" }, 8000);
  let now = await page();
  check("navigate to a filtered pipeline", Boolean(went?.ok) && now.path.includes("stage=Proposal"), `${now.path} · ${now.count}`);
  const stage = now.controls.find((control) => control.id === "filter-stage");
  check("stage filter shows its value", stage?.value === "Proposal", JSON.stringify(stage));

  let acted = await askPage({ op: "act", target: "filter-stage", kind: "type", text: "Commit" }, 2000);
  await sleep(1500);
  now = await page();
  check("choose Commit in the stage filter", Boolean(acted?.ok) && now.path.includes("stage=Commit"), `${now.path} · ${now.count}`);

  acted = await askPage({ op: "act", target: "filter-q", kind: "type", text: "harbor" }, 2000);
  await sleep(1800);
  now = await page();
  check("type in the search filter", now.path.includes("q=harbor"), `${now.path} · ${now.count}`);

  acted = await askPage({ op: "act", target: "clear-filters", kind: "click" }, 2000);
  await sleep(1500);
  now = await page();
  check("clear filters", now.path === "/pipeline", `${now.path} · ${now.count}`);

  for (const url of ["/accounts?territory=west", "/orders?status=open", "/supply?stock=low&family=oil", "/cases?status=open", "/people?department=sales&territoryId=northeast", "/invoices?status=open"]) {
    went = await askPage({ op: "navigate", url }, 8000);
    now = await page();
    check(`open ${url}`, Boolean(went?.ok) && now.path === url.replace(/ /g, "+") && now.count !== "", now.count);
  }

  await askPage({ op: "navigate", url: "/cases?status=open" }, 8000);
  acted = await askPage({ op: "act", target: "Edit", kind: "click" }, 2000);
  await sleep(400);
  now = await page();
  const saveCase = now.controls.find((control) => control.label === "Save case" || control.label === "Save");
  check("Edit opens a dialog", Boolean(saveCase), saveCase?.label ?? `${acted?.error ?? ""}`);
  await askPage({ op: "act", target: "Cancel", kind: "click" }, 2000);

  await askPage({ op: "navigate", url: "/accounts" }, 8000);
  acted = await askPage({ op: "act", target: "New account", kind: "click" }, 2000);
  await sleep(400);
  now = await page();
  check("New account opens a dialog", now.controls.some((control) => control.label === "Create account"));
  await askPage({ op: "act", target: "Cancel", kind: "click" }, 2000);

  await askPage({ op: "navigate", url: "/cases" }, 8000);
  acted = await askPage({ op: "act", target: "Delete", kind: "click" }, 2000);
  await sleep(400);
  now = await page();
  check("Delete asks to confirm", now.controls.some((control) => control.id === "confirm-delete"));
  await askPage({ op: "act", target: "Cancel", kind: "click" }, 2000);

  await askPage({ op: "navigate", url: "/supply" }, 8000);
  acted = await askPage({ op: "act", target: "Chicago dry", kind: "click" }, 2000);
  await sleep(1800);
  now = await page();
  check("warehouse card filters supply", now.path.includes("warehouse=chicago-dry"), `${now.path} · ${now.count}`);

  await askPage({ op: "navigate", url: "/pipeline?stage=Proposal" }, 8000);
  acted = await askPage({ op: "act", target: "Fieldnote logo", kind: "click" }, 8000);
  await sleep(400);
  now = await page();
  check("Fieldnote logo click goes home", Boolean(acted?.ok) && now.path === "/", `${now.path} ${acted?.error ?? ""}`);

  await askPage({ op: "navigate", url: "/supply" }, 8000);
  acted = await askPage({ op: "act", target: "logo", kind: "click" }, 8000);
  await sleep(400);
  now = await page();
  check("logo click goes home", Boolean(acted?.ok) && now.path === "/", `${now.path} ${acted?.error ?? ""}`);
} catch (error) {
  failures += 1;
  console.log("failed", error instanceof Error ? error.message : error);
} finally {
  chrome.kill("SIGKILL");
  server.close();
  console.log(failures === 0 ? "all passed" : `${failures} failed`);
  process.exit(failures === 0 ? 0 : 1);
}
