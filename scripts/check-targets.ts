import { readFile } from "node:fs/promises";
import { ask, primeCache } from "./ask.ts";
import { lookupUser } from "./lookup-user.ts";

primeCache(await lookupUser("user"), [
  { source: "discount-policy.md", text: "An account executive may discount up to 15 percent and may send a quote on their own opportunities." },
]);
const image = (await readFile(new URL("../fixtures/harbor-diner.png", import.meta.url))).toString("base64");
const screenContext = [
  'BROWSER TABS ["crm template - Google Search","Fieldnote","GitHub"]',
  'PAGE CONTROLS on Fieldnote /opportunities/opp-harbor-diner [{"label":"Pipeline"},{"label":"Clone"},{"label":"Change owner"},{"label":"View account"},{"id":"discount","label":"20"},{"id":"save-discount","label":"Save"},{"id":"send-quote","label":"Send Quote","disabled":true},{"label":"Products 3"}]',
].join("\n");

for (const question of ["open the Fieldnote tab", "where is Send Quote?", "set the discount to 15", "open the products tab", "send the quote"]) {
  const started = Date.now();
  const { stops } = await ask({ question, screenContext, imagePngBase64: image });
  console.log(`${Date.now() - started}ms`, question, "=>", stops.map((stop) => `${stop.kind} target=${stop.target} allow=${stop.allow} text=${stop.text}`).join(" | "));
}
process.exit(0);
