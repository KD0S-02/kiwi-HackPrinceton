import { ask, primeCache } from "./ask.ts";
import { lookupUser } from "./lookup-user.ts";

// Kiwi should answer work questions from Fieldnote and decline everything else,
// including questions about whatever PDF or document is open in front.
primeCache(await lookupUser("user"), []);

const elsewhere = [
  'BROWSER TABS ["Harbor Mills price sheet.pdf","Quarterly plan - Google Docs","Fieldnote"]',
  "FIELDNOTE IS NOT OPEN. kiwi opens it for you. start with a url: stop for the page that has what they want.",
].join("\n");

const cases: [string, boolean][] = [
  ["summarize this pdf", false],
  ["what does this document say about fryer oil prices", false],
  ["what's the weather in Princeton", false],
  ["write me a poem about kiwis", false],
  ["help me fix this python error", false],
  ["who won the game last night", false],
  ["who is my manager", true],
  ["why can't I send the Harbor Diner quote", true],
  ["show me open cases", true],
  ["where do I log a cycle count", true],
  ["what's the discount cap", true],
  ["take me to fieldnote", true],
];

let wrong = 0;
for (const [question, inScope] of cases) {
  const started = Date.now();
  const { stops } = await ask({ question, screenContext: elsewhere });
  const declined = stops.some((stop) => /only help/i.test(stop.say));
  const ok = inScope ? !declined : declined;
  if (!ok) wrong += 1;
  console.log(`${ok ? "pass" : "FAIL"} ${String(Date.now() - started).padStart(5)}ms ${question}\n     ${stops.map((stop) => `${stop.kind} ${stop.target || "(none)"} · ${stop.say}`).join(" | ")}`);
  await new Promise((resolve) => setTimeout(resolve, 4500));
}
console.log(wrong === 0 ? "all passed" : `${wrong} wrong`);
