import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { authoredDocsDirectory, dataDirectory, generatedDocsDirectory, recordsDirectory } from "./paths.ts";

function fail(message: string): never {
  throw new Error(message);
}

async function readJson(filePath: string) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

const rules = await readJson(path.join(dataDirectory, "rules.json"));
if (rules.discountCapPercent !== 15) fail("cap is not 15");
if (rules.sendQuote !== "own opportunities") fail("send scope is wrong");

const recordNames = await readdir(recordsDirectory);
for (const recordName of recordNames) {
  const text = await readFile(path.join(recordsDirectory, recordName), "utf8");
  if (text.includes("discountCapPercent")) fail(`${recordName} redefines the cap`);
}

const opportunities = await readJson(path.join(recordsDirectory, "opportunities.json"));
const harbor = opportunities.find((row: { id: string }) => row.id === "opp-harbor-diner");
if (!harbor) fail("missing Harbor Diner opportunity");
if (harbor.discountPercent !== 20) fail("Harbor Diner discount is not 20");
if (harbor.ownerId !== "user") fail("Harbor Diner is not owned by User");
if (harbor.amount !== 12400) fail("Harbor Diner amount is not 12400");
if (opportunities.some((row: { id: string; discountPercent: number }) => row.id !== harbor.id && row.discountPercent > 15)) {
  fail("another opportunity is over the cap");
}

const employees = await readJson(path.join(recordsDirectory, "employees.json"));
const accounts = await readJson(path.join(recordsDirectory, "accounts.json"));
const products = await readJson(path.join(recordsDirectory, "products.json"));
const contacts = await readJson(path.join(recordsDirectory, "contacts.json"));
if (employees.length !== 30) fail(`employees ${employees.length}`);
if (accounts.length !== 40) fail(`accounts ${accounts.length}`);
if (products.length !== 40) fail(`products ${products.length}`);
if (contacts.length !== 40) fail(`contacts ${contacts.length}`);

const user = employees.find((row: { id: string }) => row.id === "user");
const alex = employees.find((row: { id: string }) => row.id === "alex-morgan");
if (user?.reportsTo !== "alex-morgan") fail("User does not report to Alex");
if (user?.role !== "account executive") fail("User role");
if (alex?.name !== "Alex Morgan") fail("Alex missing");

const userAccounts = accounts.filter((row: { ownerId: string }) => row.ownerId === "user");
if (userAccounts.length < 8) fail("User should own about 8 accounts");
if (!accounts.some((row: { id: string; usualOrder: string }) => row.id === "harbor-diner" && row.usualOrder.includes("fryer oil"))) {
  fail("Harbor Diner usual order");
}

const authored = await readdir(authoredDocsDirectory);
const generated = await readdir(generatedDocsDirectory);
if (authored.length !== 24) fail(`authored ${authored.length}`);
if (generated.length < 100) fail(`generated ${generated.length}`);

const discountPolicy = await readFile(path.join(authoredDocsDirectory, "discount-policy.md"), "utf8");
const sending = await readFile(path.join(authoredDocsDirectory, "sending-a-quote.md"), "utf8");
if (!discountPolicy.includes("15 percent")) fail("policy missing cap");
if (!discountPolicy.includes("send a quote")) fail("policy missing send");
if (!sending.includes("Opportunity header")) fail("send page missing header");
if (!sending.includes("Send Quote")) fail("send page missing button");

console.log("seed ok");
console.log(`authored ${authored.length} generated ${generated.length}`);
