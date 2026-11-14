import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { StepBuffer, goalReached, prepareStops, stepAligned, stillToDo } from "../apps/desktop/steps.ts";
import { ask, primeCache, type Stop } from "./ask.ts";
import { requiredEnv } from "./load-env.ts";
import { lookupUser } from "./lookup-user.ts";

// Compares one long prompt, a short act prompt, and the deep agent on a discount
// change asked from the home page. Also checks the local repair that opens the deal
// when the model types into a field that is not on the page.
const home = [
  'PAGE CONTROLS on Fieldnote / [{"id":"brand","label":"Fieldnote logo, home"},{"label":"Pipeline"},{"label":"Open the opportunity"}]',
  'PAGE TEXT [{"text":"Harbor Diner"},{"text":"20% discount"},{"text":"Send Quote is off"}]',
].join("\n");
const deal = [
  'PAGE CONTROLS on Fieldnote /opportunities/opp-harbor-diner [{"id":"discount","label":"Discount","kind":"input","value":"20"},{"id":"save-discount","label":"Save"},{"id":"send-quote","label":"Send Quote","disabled":true}]',
  'PAGE TEXT [{"id":"quote-message","text":"An account executive stops at 15 percent."}]',
].join("\n");
const question = "Set Harbor Diner's discount to 15% and save it.";
const homeControls = [{ id: "brand", label: "Fieldnote logo, home" }, { label: "Pipeline" }, { label: "Open the opportunity" }];

function summary(stops: Stop[]) {
  return stops.map((stop) => `${stop.kind} ${stop.target}${stop.text ? `=${stop.text}` : ""}`).join(" | ") || "(no stops)";
}
function score(stops: Stop[], needOpen: boolean) {
  const opened = stops.some((stop) => /opp-harbor-diner/.test(stop.target));
  const typed = stops.some((stop) => stop.kind === "type" && stop.target === "discount" && stop.text === "15");
  const saved = stops.some((stop) => stop.kind === "click" && stop.target === "save-discount");
  return { opened, typed, saved, ok: (!needOpen || opened) && typed && saved };
}

const repaired = prepareStops(question, [
  { screen: 0, x: 0, y: 0, draw: "box", label: "Discount", say: "Set.", allow: true, kind: "type", text: "15%", target: "Discount" },
  { screen: 0, x: 0, y: 0, draw: "circle", label: "Save discount", say: "Save.", allow: true, kind: "click", text: "", target: "Save discount" },
], homeControls);
const localOk = score(repaired, true).ok && stillToDo(question, repaired) === false
  && stillToDo(question, [repaired[0]]) === true;
console.log(`${localOk ? "pass" : "FAIL"} local repair opens the deal, types 15, and saves\n     ${summary(repaired)}`);
if (!localOk) process.exit(1);

const blank = { screen: 0, x: 0, y: 0, draw: "circle" as const, say: "", allow: true, text: "" };
const openDeal = { ...blank, label: "Harbor Diner", kind: "click" as const, target: "url:/opportunities/opp-harbor-diner" };
const typeDiscount = { ...blank, label: "Discount", kind: "type" as const, target: "discount", text: "15" };
const saveDiscount = { ...blank, label: "Save", kind: "click" as const, target: "save-discount" };
const buffer = new StepBuffer();
buffer.push([openDeal, typeDiscount, saveDiscount, { ...blank, label: "Extra", kind: "show", target: "none" }]);
const queued = [buffer.takeNext(), buffer.takeNext(), buffer.takeNext(), buffer.takeNext()];
const bufferOk = queued[0]?.target === openDeal.target && queued[1]?.target === "discount" && queued[2]?.target === "save-discount" && queued[3] === undefined;
const homeAligned = stepAligned(openDeal, homeControls) && !stepAligned(typeDiscount, homeControls);
const dealControls = [{ id: "discount", label: "Discount" }, { id: "save-discount", label: "Save" }];
const dealAligned = stepAligned(typeDiscount, dealControls) && stepAligned(saveDiscount, dealControls);
const discountDone = goalReached(question, [openDeal, typeDiscount, saveDiscount], true) && !goalReached(question, [openDeal], true);
const listDone = goalReached("show me open cases", [{ ...blank, label: "Cases", kind: "click", target: "url:/cases?status=open" }], true);
const tara = "can I add a new restaurant called Tara?";
const taraClosed = prepareStops(tara, [{ ...blank, label: "New account", kind: "show", target: "new-account" }], homeControls);
const taraOpen = prepareStops(tara, [], [{ id: "new-account-name", label: "Restaurant name" }, { id: "new-account-submit", label: "Create account" }]);
const taraZip = "add a restaurant called Tara Bistro at 07302";
const taraCreate = prepareStops(taraZip, [], [{ id: "new-account-name", label: "Restaurant name", value: "Tara Bistro" }, { id: "new-account-zip", label: "ZIP code" }, { id: "new-account-submit", label: "Create account" }]);
const howTo = prepareStops("how do I add a new restaurant called Tara?", [{ ...blank, label: "New account", kind: "show", target: "new-account" }], homeControls);
const accountOk = taraClosed.map((stop) => stop.target).join(",") === "url:/accounts,new-account"
  && taraOpen[0]?.target === "new-account-name" && taraOpen[0]?.text === "Tara" && /zip/i.test(taraOpen[0]?.say ?? "") && taraOpen.length === 1
  && taraCreate.map((stop) => `${stop.kind}:${stop.target}:${stop.text}`).join(",") === "type:new-account-zip:07302,click:new-account-submit:"
  && !goalReached(tara, taraClosed, true)
  && goalReached(tara, taraOpen, true)
  && howTo.length === 1 && howTo[0]?.target === "new-account";
if (!bufferOk || !homeAligned || !dealAligned || !discountDone || !listDone || !accountOk) {
  console.log("FAIL buffer", { bufferOk, homeAligned, dealAligned, discountDone, listDone, accountOk });
  process.exit(1);
}
console.log("pass buffer keeps plan order, drops a step that is not on the page, and stops when the goal is met");

primeCache(await lookupUser("user"), [
  { source: "discount-policy.md", text: "An account executive may discount up to 15 percent and may send a quote on their own opportunities." },
]);
const pause = () => new Promise((resolve) => setTimeout(resolve, 5000));

async function run(name: string, mode: "lean" | "act" | "deep" | undefined, context: string, asked = question) {
  const started = Date.now();
  const { stops } = await ask({ question: asked, screenContext: context, ...(mode ? { mode } : {}) });
  const onDeal = context === deal;
  const result = score(prepareStops(asked, stops, onDeal ? [{ id: "discount", label: "Discount" }, { id: "save-discount", label: "Save" }] : homeControls), !onDeal);
  console.log(`${result.ok ? "pass" : "FAIL"} ${String(Date.now() - started).padStart(5)}ms ${name}\n     ${summary(stops)}\n     after repair: open ${result.opened} type ${result.typed} save ${result.saved}`);
  return stops;
}

const lean = await run("long prompt, from home", undefined, home);
await pause();
await run("short act prompt, from home", "act", home);
await pause();
await run("deep agent, from home", "deep", home);
await pause();
await run("long prompt, already on the deal", undefined, deal);
await pause();
await run("short act prompt, already on the deal", "act", deal);
await pause();

if (stillToDo(question, lean)) {
  await run("continuation after a navigate-only reply", "act", deal, `${question}\nThe deal is open. Type the discount and click save-discount now. Do not navigate.`);
  await pause();
} else {
  console.log("pass      continuation not needed: the long prompt already included the change");
}

const classifier = new ChatGoogleGenerativeAI({
  model: requiredEnv("GEMINI_MODEL"),
  apiKey: requiredEnv("GEMINI_API_KEY"),
  temperature: 0,
  maxOutputTokens: 80,
  thinkingConfig: { thinkingBudget: 0 },
});
const started = Date.now();
const verdict = await classifier.invoke([
  { role: "system", content: "Classify each question as one word: act, navigate, answer, or decline. act means change a record. navigate means open or filter a page. answer means a fact. decline means not work. Reply with the five words, one per line, nothing else." },
  { role: "user", content: [
    "Set Harbor Diner's discount to 15% and save it.",
    "show me open cases",
    "who is my manager",
    "write me a poem about my pipeline",
    "show proposal deals that aren't mine",
  ].join("\n") },
]);
const lines = String(verdict.content).trim().split(/\n/).map((line) => line.trim().toLowerCase());
const expected = ["act", "navigate", "answer", "decline", "navigate"];
await pause();
const filterStarted = Date.now();
const filtered = await ask({
  question: "show me proposal deals over the cap that aren't mine",
  screenContext: home,
});
const filterTarget = filtered.stops.map((stop) => stop.target).join(" ");
const filterOk = /pipeline/i.test(filterTarget) && /proposal/i.test(filterTarget) && /discount=over/.test(filterTarget) && !/owner=mine|ownerId=user/.test(filterTarget);
console.log(`${filterOk ? "pass" : "FAIL"} ${String(Date.now() - filterStarted).padStart(5)}ms multi-filter from a loose question\n     ${summary(filtered.stops)}`);

const classified = expected.every((word, index) => (lines[index] ?? "").includes(word));
console.log(`${classified ? "pass" : "FAIL"} ${String(Date.now() - started).padStart(5)}ms intent classifier\n     ${lines.join(" | ")}  wanted ${expected.join(" | ")}`);
