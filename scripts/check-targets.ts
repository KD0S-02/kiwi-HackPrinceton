import { readFile } from "node:fs/promises";
import { ask, primeCache } from "./ask.ts";
import { lookupUser } from "./lookup-user.ts";

primeCache(await lookupUser("user"), [
  { source: "discount-policy.md", text: "An account executive may discount up to 15 percent and may send a quote on their own opportunities." },
]);
const image = (await readFile(new URL("../fixtures/harbor-diner.png", import.meta.url))).toString("base64");
const screenContext = [
  'BROWSER TABS ["crm template - Google Search","Fieldnote","GitHub"]',
  'PAGE TEXT [{"text":"Harbor Diner"},{"id":"stage","text":"Proposal"},{"id":"quote-message","text":"An account executive stops at 15 percent. Your manager, Alex Morgan, has to approve the rest."}]',
  'PAGE CONTROLS on Fieldnote /opportunities/opp-harbor-diner [{"label":"Pipeline"},{"label":"Clone"},{"label":"Change owner"},{"label":"View account"},{"id":"discount","label":"20"},{"id":"save-discount","label":"Save"},{"id":"send-quote","label":"Send Quote","disabled":true},{"label":"Products 3"}]',
].join("\n");

for (const question of ["set the discount to 15", "what does Harbor Diner usually order?", "set the discount to 20", "who approves big discounts?", "set the discount to 15", "what does Harbor Diner usually order?"]) {
  const started = Date.now();
  const { stops } = await ask({ question, screenContext, ...(process.env.WITH_PICTURE ? { imagePngBase64: image } : {}) });
  console.log(`${Date.now() - started}ms`, question, "=>", stops.map((stop) => `${stop.kind} target=${stop.target} allow=${stop.allow} text=${stop.text} say=${stop.say}`).join(" | "));
}
process.exit(0);
