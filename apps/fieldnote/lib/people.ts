import directoryJson from "./sign-in.json";

export type Person = {
  id: string;
  email: string;
  name: string;
  initials: string;
  role: string;
  managerName: string;
  approverName: string;
  approverId: string;
  territory: string;
  office: string;
  book: "own" | "team" | "company";
  greeting: string;
  workflow: string;
};

export function seesAll(person: { book: Person["book"] }) {
  return person.book !== "own";
}

export function authorityLine(person: Person) {
  const name = firstName(person);
  if (!person.managerName && !person.approverName) {
    return `${name} owns Fieldnote. he has no manager and no approver. nothing over the cap is sent on to someone else.`;
  }
  return `${person.managerName} is ${name}'s manager. ${person.approverName} approves discounts over the cap.`;
}

const directory = directoryJson as Person[];

export function people() {
  return directory;
}

export function personById(id: string) {
  return directory.find((person) => person.id === id);
}

// Email sign-in. Spaces and capitals do not matter. An empty or unknown email is an error.
export function personByEmail(email: string): { person: Person } | { error: string } {
  const cleaned = email.trim().toLowerCase();
  if (!cleaned) return { error: "Enter your work email." };
  const person = directory.find((item) => item.email.toLowerCase() === cleaned);
  if (!person) return { error: `No Fieldnote account for ${cleaned}.` };
  return { person };
}

export function firstName(person: Person) {
  return person.name.split(" ")[0];
}

// How "my" and "mine" filter, for this person. A senior reviews the team book.
export function mineLine(person: Person) {
  const name = firstName(person);
  if (person.book === "company") {
    return `"my" and "mine" for ${name} mean the whole company: owner=all on /accounts and /pipeline. do not add ownerId=${person.id}. he owns the company, not a personal book of restaurants.`;
  }
  if (person.book === "team") {
    return `"my" and "mine" for ${name} mean the team's book: owner=all on /accounts and /pipeline. do not add ownerId=${person.id}. he has no personal book.`;
  }
  return `"my", "mine" and "${person.name}'s" mean owner=mine on /accounts and /pipeline and ownerId=${person.id} on other lists. on /pipeline, owner=all means everyone. add an owner filter only when the question says my, mine, or names a person.`;
}

// The model treats "show me" as "show me mine". Keep an owner filter only when this person asked for one.
export function adjustOwner(question: string, target: string, person: Person) {
  if (!/^url:/i.test(target)) return target;
  const [pathname, query = ""] = target.slice(4).trim().split("?");
  const params = new URLSearchParams(query);
  const named = new RegExp(`\\b(my|mine|i own|i'm on|${firstName(person)})\\b`, "i");
  if (seesAll(person)) {
    if (params.get("owner") === "mine") params.set("owner", "all");
    if (params.get("ownerId") === person.id) params.delete("ownerId");
  } else if (!named.test(question)) {
    if (params.get("owner") === "mine") params.delete("owner");
    if (params.get("ownerId") === person.id) params.delete("ownerId");
  }
  const rest = params.toString();
  return `url:${pathname}${rest ? `?${rest}` : ""}`;
}
