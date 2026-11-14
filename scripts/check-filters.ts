import { ask, primeCache } from "./ask.ts";
import { lookupUser } from "./lookup-user.ts";

// Asks Kiwi list questions and checks that each answer is a Fieldnote URL that renders.
primeCache(await lookupUser("user"), []);

const screenContext = [
  'BROWSER TABS ["Fieldnote"]',
  'PAGE CONTROLS on Fieldnote /pipeline [{"label":"Home"},{"label":"Accounts"},{"label":"Pipeline"},{"label":"Fulfillment"},{"label":"Supply"},{"label":"Company"},{"id":"filter-q","label":"Search"},{"id":"filter-stage","label":"Stage","value":"All stages","options":["All stages","Qualify","Proposal","Commit"]},{"id":"filter-owner","label":"Owner","value":"Only mine"},{"label":"New opportunity"}]',
].join("\n");

const questions = [
  "show me my deals in proposal",
  "show me everyone's deals over the discount cap",
  "which open cases are delivery complaints",
  "show me open orders shipping from Chicago",
  "show me low oil stock",
  "show me Morgan Blake's accounts in the west",
  "show me the paper products",
  "show me unpaid invoices",
  "list the purchase orders from Great Lakes Oil",
  "show me deals over 5000 dollars from everyone",
  "who in sales is in the northeast",
  "add a new account",
];

const base = process.env.FIELDNOTE_URL ?? "http://localhost:3000";
for (const question of questions) {
  const started = Date.now();
  const { stops } = await ask({ question, screenContext });
  const stop = stops[0];
  const target = stop?.target ?? "";
  let check = "";
  if (target.startsWith("url:")) {
    const response = await fetch(`${base}${target.slice(4).trim()}`, { headers: { cookie: "fieldnote_session=user" }, redirect: "manual" });
    const body = await response.text();
    check = `${response.status} ${body.match(/id="filter-count"[^>]*>([^<]*)</)?.[1] ?? ""}`;
  }
  const rest = stops.slice(1).map((next) => ` then ${next.kind} ${next.target}`).join("");
  console.log(`${String(Date.now() - started).padStart(5)}ms ${question}\n        ${stop?.kind} ${target}${rest} | ${check} | ${stop?.say}`);
}
