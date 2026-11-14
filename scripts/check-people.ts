import { actPromptFor, primeCache, systemPromptFor } from "./ask.ts";
import { ownerMatches } from "../apps/fieldnote/lib/filters.ts";
import { adjustOwner, personByEmail, personById, type Person } from "../apps/fieldnote/lib/people.ts";
import { lookupUser } from "./lookup-user.ts";

function fail(message: string): never {
  throw new Error(message);
}

function mustPerson(email: string): Person {
  const found = personByEmail(email);
  if ("error" in found) fail(`${email}: ${found.error}`);
  return found.person;
}

const blank = personByEmail("   ");
if (!("error" in blank) || blank.error !== "Enter your work email.") fail(`empty email: ${JSON.stringify(blank)}`);
const unknown = personByEmail("nope@fieldnote.com");
if (!("error" in unknown) || !unknown.error.includes("nope@fieldnote.com")) fail(`unknown email: ${JSON.stringify(unknown)}`);
if (personById("missing")) fail("unknown id should be empty");

const sparsh = mustPerson("  Sparsh.Bohra@Fieldnote.com ");
const shail = mustPerson("SHAIL.SHAH@fieldnote.com");
const krishna = mustPerson(" Krishna.Das@Fieldnote.com ");
if (sparsh.id !== "user") fail("Sparsh id changed");
if (shail.id !== "shail-shah") fail("Shail id");
if (krishna.id !== "krishna-das" || krishna.role !== "owner" || krishna.book !== "company") fail("Krishna context");
if (krishna.managerName || krishna.approverName || krishna.approverId) fail("Krishna should have no manager or approver");
if (sparsh.managerName !== "Shail Shah" || sparsh.approverName !== "Shail Shah" || sparsh.book !== "own") fail("Sparsh context");
if (shail.managerName !== "Krishna Das" || shail.approverName !== "Krishna Das" || shail.book !== "team") fail("Shail context");

const sparshPrompt = `${systemPromptFor(sparsh)}\n${actPromptFor(sparsh)}`;
const shailPrompt = `${systemPromptFor(shail)}\n${actPromptFor(shail)}`;
const krishnaPrompt = `${systemPromptFor(krishna)}\n${actPromptFor(krishna)}`;
for (const phrase of ["Sparsh Bohra", "Shail Shah", "Harbor Diner", "ownerId=user", "owns his restaurants"]) {
  if (!sparshPrompt.includes(phrase)) fail(`Sparsh prompt missing ${phrase}`);
}
if (sparshPrompt.includes("Krishna Das")) fail("Sparsh prompt names Shail's manager");
if (sparshPrompt.includes("does not carry a personal book")) fail("Sparsh prompt has Shail's workflow");
for (const phrase of ["Shail Shah", "Krishna Das", "does not carry a personal book", "owner=all", "does not approve that exception himself"]) {
  if (!shailPrompt.includes(phrase)) fail(`Shail prompt missing ${phrase}`);
}
if (shailPrompt.includes("Harbor Diner is the deal on his book")) fail("Shail prompt has Sparsh's Harbor line");
if (!shailPrompt.includes("do not add ownerId=shail-shah")) fail("Shail prompt should forbid a personal owner filter");
for (const phrase of ["Krishna Das", "owns Fieldnote", "no manager and no approver", "owner=all", "not a personal book"]) {
  if (!krishnaPrompt.includes(phrase)) fail(`Krishna prompt missing ${phrase}`);
}
if (krishnaPrompt.includes("is Krishna's manager")) fail("Krishna prompt invents a manager");
if (adjustOwner("show my deals", "url:/pipeline?owner=mine&ownerId=krishna-das", krishna) !== "url:/pipeline?owner=all") {
  fail("Krishna mine should be the whole company");
}
if (!ownerMatches("ae-west", "mine", krishna)) fail("Krishna mine is the company");

if (adjustOwner("show the pipeline", "url:/pipeline?stage=Proposal&owner=mine", sparsh) !== "url:/pipeline?stage=Proposal") {
  fail("Sparsh show-me should drop owner=mine");
}
if (adjustOwner("show my deals", "url:/pipeline?owner=mine&ownerId=user", sparsh) !== "url:/pipeline?owner=mine&ownerId=user") {
  fail("Sparsh my should keep his book");
}
if (adjustOwner("show my deals", "url:/pipeline?owner=mine&ownerId=shail-shah", shail) !== "url:/pipeline?owner=all") {
  fail(`Shail mine should be the team book, got ${adjustOwner("show my deals", "url:/pipeline?owner=mine&ownerId=shail-shah", shail)}`);
}
if (adjustOwner("show cedar", "url:/accounts?owner=all", shail) !== "url:/accounts?owner=all") fail("explicit everyone stays");

if (!ownerMatches("user", "mine")) fail("default viewer is Sparsh");
if (ownerMatches("ae-west", "mine", sparsh)) fail("Sparsh mine is only his rows");
if (!ownerMatches("user", "mine", sparsh)) fail("Sparsh mine includes his rows");
if (!ownerMatches("ae-west", "mine", shail)) fail("Shail mine is the team");
if (!ownerMatches("user", "all", shail)) fail("all is everyone");

primeCache({ id: "user", name: "Sparsh Bohra" }, []);
primeCache({ id: "shail-shah", name: "Shail Shah" }, []);

const lookedUp = await lookupUser("shail-shah");
if (lookedUp.name !== "Shail Shah") fail(`lookup name ${lookedUp.name}`);
if (lookedUp.org.manager !== "Krishna Das") fail(`lookup manager ${lookedUp.org.manager}`);
const ownerLookup = await lookupUser("krishna-das");
if (ownerLookup.name !== "Krishna Das" || ownerLookup.role !== "owner") fail(`Krishna lookup ${ownerLookup.role}`);
if (ownerLookup.org.manager) fail(`Krishna lookup manager ${ownerLookup.org.manager}`);
const sparshLookup = await lookupUser("user");
if (sparshLookup.org.manager !== "Shail Shah") fail(`Sparsh manager ${sparshLookup.org.manager}`);
if (sparshLookup.role !== "account executive") fail(`Sparsh role ${sparshLookup.role}`);

console.log("people ok");
console.log(`${sparsh.name} owns his book, manager ${sparsh.managerName}`);
console.log(`${shail.name} reviews the team, manager ${shail.managerName}, approver ${shail.approverName}`);
console.log(`${krishna.name} owns Fieldnote, no manager, no approver`);
