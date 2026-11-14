import { readFileSync } from "node:fs";
import { ask, primeCache, type Stop } from "./ask.ts";
import { lookupUser } from "./lookup-user.ts";

// Kiwi reading what is on screen: a supplier PDF and a supplier email, plus questions it
// should still decline. Uses /tmp/kiwi-sheet.png and /tmp/kiwi-email.png (see README).
primeCache(await lookupUser("user"), []);

const sheet = readFileSync("/tmp/kiwi-sheet.png").toString("base64");
const email = readFileSync("/tmp/kiwi-email.png").toString("base64");
const fieldnoteClosed = "FIELDNOTE IS NOT OPEN. kiwi opens it for you. start with a url: stop for the page that has what they want.";

type Case = { question: string; image?: string; front: string; earlier?: string; expect: (stops: Stop[]) => boolean; why: string };

const declined = (stops: Stop[]) => stops.some((stop) => /outside work|only help|i'll pass/i.test(stop.say));
const noteHas = (pattern: RegExp) => (stops: Stop[]) => !declined(stops) && stops.some((stop) => pattern.test(`${stop.note ?? ""} ${stop.say}`));

const cases: Case[] = [
  { question: "summarize this pdf", image: sheet, front: "Preview — kiwi-sheet.pdf", expect: noteHas(/fryer oil/i), why: "summary in the note" },
  { question: "what's the new fryer oil price on this sheet", image: sheet, front: "Preview — kiwi-sheet.pdf", expect: noteHas(/34\.50/), why: "reads $34.50" },
  { question: "which items went up", image: sheet, front: "Preview — kiwi-sheet.pdf", expect: noteHas(/towel/i), why: "lists oil and paper towels" },
  { question: "what does this email want from me", image: email, front: "Mail — Fryer oil going up Dec 1", expect: noteHas(/friday|commit/i), why: "reply by Friday about the commitment" },
  { question: "draft a reply saying yes, write it up for Harbor Diner", image: email, front: "Mail — Fryer oil going up Dec 1", expect: noteHas(/dana/i), why: "a draft addressed to Dana" },
  {
    question: "paste it in",
    image: email,
    front: "Mail — Re: Fryer oil going up Dec 1",
    earlier: "User: draft a reply saying yes\nKiwi: Here's a draft in my window.\nKiwi wrote: Hi Dana, yes please write up the 6-month commitment for Harbor Diner. Thanks, Sparsh",
    expect: (stops) => stops.some((stop) => stop.target === "paste" && /dana/i.test(stop.text)),
    why: "target paste with the draft",
  },
  { question: "write me a poem about this", image: email, front: "Mail — Fryer oil going up Dec 1", expect: declined, why: "declines a poem" },
  { question: "who won the game last night", front: "Safari — ESPN", expect: declined, why: "declines sports" },
  { question: "tell me a joke", front: "Notes", expect: declined, why: "declines a joke" },
  { question: "who is my manager", front: "Preview — kiwi-sheet.pdf", expect: (stops) => !declined(stops) && stops.some((stop) => /alex morgan/i.test(stop.say)), why: "work question from anywhere" },
];

let wrong = 0;
for (const item of cases) {
  const started = Date.now();
  const question = item.earlier ? `Earlier:\n${item.earlier}\n\n${item.question}` : item.question;
  const { stops } = await ask({
    question,
    screenContext: `FRONT APP ${item.front}\n${item.image ? "SCREEN attached\n" : ""}${fieldnoteClosed}`,
    ...(item.image ? { imagePngBase64: item.image, imageMime: "image/png" as const } : {}),
  });
  const ok = item.expect(stops);
  if (!ok) wrong += 1;
  console.log(`${ok ? "pass" : "FAIL"} ${String(Date.now() - started).padStart(5)}ms ${item.question} (${item.why})`);
  for (const stop of stops) {
    console.log(`     ${stop.kind} ${stop.target || "(none)"} · ${stop.say}${stop.note ? `\n     note: ${stop.note.replace(/\n/g, "\n           ")}` : ""}`);
  }
  await new Promise((resolve) => setTimeout(resolve, 4500));
}
console.log(wrong === 0 ? "all passed" : `${wrong} wrong`);
