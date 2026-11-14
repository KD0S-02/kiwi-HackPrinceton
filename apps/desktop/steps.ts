import type { Stop } from "../../scripts/ask.ts";

type Control = { id?: string; label: string; value?: string };

// A discount change is not finished when Kiwi only opens the page, or when it
// aims the typing at a page that does not have the field. A named new restaurant
// is not finished when the dialog is only opened.
export function stillToDo(question: string, stops: Stop[]) {
  if (accountRequest(question)) return accountStillToDo(question, stops);
  if (!wantsDiscount(question)) return false;
  const typed = stops.some((stop) => stop.kind === "type" && /discount/i.test(`${stop.target} ${stop.label}`) && stop.text.trim());
  const saved = stops.some((stop) => stop.kind === "click" && stop.allow && /save/i.test(`${stop.target} ${stop.label}`));
  return !typed || !saved;
}

export function prepareStops(question: string, stops: Stop[], controls: Control[]) {
  const next = stops.map((stop) => normalizeDiscount(question, stop));
  const url = dealUrl(question);
  const missing = next.some((stop) => stop.allow && stop.kind !== "show" && !controlHere(stop.target, controls));
  const alreadyGoing = next.some((stop) => /^url:/i.test(stop.target));
  const planned = !url || !missing || alreadyGoing || !wantsDiscount(question) ? next : [openDeal(url), ...next];
  return ensureAccount(question, planned, controls);
}

function openDeal(url: string): Stop {
  return {
    screen: 0,
    x: 0,
    y: 0,
    draw: "none",
    text: "",
    label: "Opportunity",
    say: "Opening that deal.",
    allow: true,
    kind: "click",
    target: `url:${url}`,
  };
}

function wantsDiscount(question: string) {
  return /\b(set|change|update|save|add|put|make)\b/i.test(question) && /\bdiscount\b/i.test(question);
}

// "Add a restaurant called Tara" is a request to finish the form. A how-to is not.
function accountRequest(question: string) {
  if (/\bhow\b/i.test(question)) return false;
  return /\b(add|create|make|open)\b/i.test(question) && /\b(account|restaurant)\b/i.test(question) && restaurantName(question) !== "";
}

function restaurantName(question: string) {
  const match = question.match(/\b(?:called|named)\s+([A-Za-z][A-Za-z0-9'&.-]*(?:\s+[A-Za-z][A-Za-z0-9'&.-]*){0,3})/i);
  return match?.[1]?.replace(/\s+(?:at|in|near|zip|with|for|and)$/i, "").trim() ?? "";
}

function restaurantZip(question: string) {
  return question.match(/\b(\d{5})(?:-\d{4})?\b/)?.[1] ?? "";
}

function controlValue(controls: Control[], id: string) {
  return controls.find((control) => (control.id ?? "").toLowerCase() === id)?.value?.trim() ?? "";
}

function accountStillToDo(question: string, stops: Stop[]) {
  const name = restaurantName(question).toLowerCase();
  const named = stops.some((stop) => stop.kind === "type" && stop.target === "new-account-name" && stop.text.trim().toLowerCase() === name);
  const zip = restaurantZip(question);
  if (!zip) return !named || !stops.some((stop) => /zip/i.test(stop.say));
  const zipped = stops.some((stop) => stop.kind === "type" && stop.target === "new-account-zip" && stop.text.trim() === zip);
  const created = stops.some((stop) => stop.kind === "click" && stop.allow && stop.target === "new-account-submit");
  return !named || !zipped || !created;
}

function accountStop(kind: Stop["kind"], target: string, say: string, text = ""): Stop {
  return {
    screen: 0,
    x: 0,
    y: 0,
    draw: kind === "type" ? "box" : "circle",
    label: target,
    say,
    allow: true,
    kind,
    text,
    target,
  };
}

// Open the dialog first. Once it is open, type what he gave and create the account.
function ensureAccount(question: string, stops: Stop[], controls: Control[]) {
  if (!accountRequest(question)) return stops;
  const name = restaurantName(question);
  const zip = restaurantZip(question);
  const open = controls.some((control) => {
    const id = (control.id ?? "").toLowerCase();
    return id === "new-account-name" || id === "new-account-submit";
  });
  if (!open) {
    return [
      accountStop("click", "url:/accounts", "Opening Accounts."),
      accountStop("click", "new-account", "Opening the new account form."),
    ];
  }
  const steps: Stop[] = [];
  if (controlValue(controls, "new-account-name").toLowerCase() !== name.toLowerCase()) {
    steps.push(accountStop("type", "new-account-name", zip ? `Setting the name to ${name}.` : `${name} is in. What ZIP should I use?`, name));
  }
  if (zip && controlValue(controls, "new-account-zip") !== zip) {
    steps.push(accountStop("type", "new-account-zip", `Setting the ZIP to ${zip}.`, zip));
  }
  if (zip) steps.push(accountStop("click", "new-account-submit", `Creating ${name}.`));
  if (steps.length === 0) {
    return [accountStop("type", "new-account-name", `${name} is in. What ZIP should I use?`, name)];
  }
  return steps.slice(0, 3);
}

function normalizeDiscount(question: string, stop: Stop): Stop {
  if (stop.kind === "type" && /discount/i.test(`${stop.target} ${stop.label}`)) {
    return { ...stop, target: "discount", text: stop.text.replace(/%/g, "").trim() };
  }
  if (stop.kind === "click" && wantsDiscount(question) && /save/i.test(`${stop.target} ${stop.label}`)) {
    return { ...stop, target: "save-discount" };
  }
  return stop;
}

export class StepBuffer {
  private steps: Stop[] = [];

  push(steps: Stop[]) {
    for (const step of steps) {
      if (this.steps.length >= 3) return;
      this.steps.push(step);
    }
  }

  // The next planned step, in the order the planner added them.
  takeNext() {
    return this.steps.shift();
  }

  clear() {
    this.steps = [];
  }

  get pending() {
    return this.steps.length;
  }
}

// A url, a tab, a paste, or an answer can run from any page. A click or a
// type can run only when that control is on the page open right now.
export function stepAligned(stop: Stop, controls: Control[]) {
  const target = stop.target.trim();
  if (!target || target === "none" || target === "paste" || /^(url|tab):/i.test(target)) return true;
  return controlHere(target, controls);
}

export function goalReached(question: string, played: Stop[], bufferEmpty: boolean) {
  if (played.length === 0) return false;
  if (wantsDiscount(question) || accountRequest(question)) return !stillToDo(question, played);
  const last = played[played.length - 1];
  if (!last.target || last.target === "none") return true;
  if (!bufferEmpty) return false;
  if (last.kind === "show") return true;
  return /^url:/i.test(last.target) && !/\b(set|change|update|type|click|press|why|how|walk|tour|guide|approve)\b/i.test(question);
}

function controlHere(target: string, controls: Control[]) {
  const wanted = target.trim().toLowerCase();
  if (!wanted || wanted === "none" || wanted === "paste" || /^(url|tab):/.test(wanted)) return true;
  return controls.some((control) => {
    const label = control.label.toLowerCase();
    const id = (control.id ?? "").toLowerCase();
    return id === wanted || label === wanted || label.includes(wanted) || (wanted.includes(label) && label.length > 3);
  });
}

function dealUrl(question: string) {
  const raw = question.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)'s\s+discount\b/)?.[1]
    ?? question.match(/\bdiscount\b.{0,40}?\bfor\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/)?.[1]
    ?? "";
  const name = raw.replace(/^(set|add|change|update|save|put|make|give)\s+/i, "");
  if (!name) return "";
  const slug = name.toLowerCase().replace(/\s+/g, "-");
  if (slug === "alex-morgan") return "";
  return `/opportunities/opp-${slug}`;
}
