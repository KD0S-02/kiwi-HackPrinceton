import { ask, primeCache, type Stop } from "./ask.ts";
import { lookupUser } from "./lookup-user.ts";

// Longer, looser questions: going home via the sidebar logo, catching up, and questions
// that ask for two things at once. Short one-button commands stay in check-router.ts.
primeCache(await lookupUser("user"), []);

const home = [
  "PAGE CONTROLS on Fieldnote / [",
  '{"id":"brand","label":"Fieldnote logo, home","kind":"a"},',
  '{"label":"Home","kind":"a"},{"label":"Accounts","kind":"a"},{"label":"Pipeline","kind":"a"},',
  '{"label":"Fulfillment","kind":"a"},{"label":"Supply","kind":"a"},{"label":"Company","kind":"a"},',
  '{"label":"Your book","kind":"a"},{"label":"New opportunity","kind":"button"},',
  '{"label":"Open the opportunity","kind":"a"},{"label":"Open pipeline","kind":"a"}]',
  'PAGE TEXT [{"text":"Good morning, Sparsh"},{"text":"Harbor Diner"},{"text":"Proposal · $12,400"},',
  '{"text":"20% discount"},{"text":"Send Quote is off"},',
  '{"text":"An account executive stops at 15 percent. Your manager, Alex Morgan, has to approve the rest."},',
  '{"text":"Open deals 10"},{"text":"Over the cap 1"},{"text":"Open cases 3"}]',
].join("");

const deal = [
  "PAGE CONTROLS on Fieldnote /opportunities/opp-harbor-diner [",
  '{"id":"brand","label":"Fieldnote logo, home","kind":"a"},',
  '{"id":"discount","label":"Discount","kind":"input","value":"20"},',
  '{"id":"save-discount","label":"Save discount","kind":"button"},',
  '{"id":"send-quote","label":"Send Quote","kind":"button","disabled":true},',
  '{"label":"Open pipeline","kind":"a"}]',
  'PAGE TEXT [{"id":"quote-message","text":"An account executive stops at 15 percent. Your manager, Alex Morgan, has to approve the rest."},',
  '{"text":"Harbor Diner"},{"text":"$12,400"},{"text":"20% discount"}]',
].join("");

const textOf = (stops: Stop[]) => stops.map((stop) => `${stop.say} ${stop.note ?? ""} ${stop.target}`).join(" ");
const declined = (stops: Stop[]) => /outside work|only help|i'll pass/i.test(textOf(stops));
const goesHome = (stops: Stop[]) => stops.some((stop) => stop.kind === "click" && stop.allow && /^(brand|home|url:\/?)$/i.test(stop.target.trim()));
const mentions = (pattern: RegExp) => (stops: Stop[]) => pattern.test(textOf(stops));

const cases: { question: string; context: string; expect: (stops: Stop[]) => boolean; why: string }[] = [
  { question: "I'm done with this deal. Go back home by clicking the Fieldnote logo in the sidebar.", context: deal, expect: goesHome, why: "clicks the logo home" },
  { question: "click the logo", context: deal, expect: goesHome, why: "clicks brand" },
  { question: "head back to the start and tell me what needs a decision", context: deal, expect: (stops) => goesHome(stops) && mentions(/harbor|15%|15 percent|alex morgan/i)(stops), why: "home and the decision" },
  { question: "what should I be paying attention to this morning?", context: home, expect: (stops) => !declined(stops) && mentions(/harbor|discount|alex|decision|quote/i)(stops), why: "names the urgent deal" },
  { question: "catch me up. anything on my book I should deal with today?", context: home, expect: (stops) => !declined(stops) && mentions(/harbor|case|discount|pipeline|quote/i)(stops), why: "a catch-up, not a decline" },
  { question: "I don't really get this page. what's the main thing I need to do?", context: home, expect: (stops) => !declined(stops) && mentions(/harbor|discount|approve|alex|quote/i)(stops), why: "explains the page" },
  { question: "why is send quote off for the diner, and who has to fix it?", context: deal, expect: (stops) => !declined(stops) && mentions(/15|alex/i)(stops), why: "the cap and Alex" },
  { question: "show me the open delivery complaints, and then open Harbor Diner", context: home, expect: (stops) => stops.some((stop) => /cases/i.test(stop.target)) && stops.some((stop) => /harbor/i.test(stop.target)), why: "cases, then the account" },
  { question: "can you pull up deals in proposal that aren't mine and tell me what I'm looking at", context: home, expect: (stops) => stops.some((stop) => /pipeline/i.test(stop.target) && /proposal/i.test(stop.target) && !/owner=mine|ownerId=user/.test(stop.target)), why: "everyone's proposal deals" },
  { question: "draft a short note to Alex about the Harbor Diner discount, and open that deal too", context: home, expect: (stops) => mentions(/harbor|discount/i)(stops) && stops.some((stop) => /opp-harbor-diner|harbor-diner|open the opportunity/i.test(`${stop.target} ${stop.label}`)), why: "a note and the deal" },
  { question: "where do I log a cycle count, and what is that page for?", context: home, expect: (stops) => !declined(stops) && stops.some((stop) => /supply|cycle/i.test(`${stop.target} ${stop.label}`)), why: "points at supply" },
  { question: "write me a poem about my pipeline", context: home, expect: declined, why: "still declines a poem" },
  { question: "who won the game last night, and also what's the weather", context: home, expect: declined, why: "still declines sports" },
];

let wrong = 0;
for (const item of cases) {
  const started = Date.now();
  const { stops } = await ask({ question: item.question, screenContext: item.context });
  const ok = item.expect(stops);
  if (!ok) wrong += 1;
  console.log(`${ok ? "pass" : "FAIL"} ${String(Date.now() - started).padStart(5)}ms ${item.question} (${item.why})`);
  for (const stop of stops) {
    console.log(`     ${stop.kind} ${stop.target || "(none)"} · ${stop.say}${stop.note ? ` | ${stop.note.replace(/\n/g, " / ")}` : ""}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 4500));
}
console.log(wrong === 0 ? "all passed" : `${wrong} wrong`);
