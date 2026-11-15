import type { Stop } from "../../scripts/ask.ts";

type Control = { id?: string; label: string; value?: string; disabled?: boolean };
type Fact = { text: string };

// A discount change is not finished when Kiwi only opens the page, or when it
// aims the typing at a page that does not have the field. A named new restaurant
// is not finished when the dialog is only opened.
export function stillToDo(question: string, stops: Stop[]) {
  if (accountRequest(question)) return accountStillToDo(question, stops);
  if (quoteRequest(question)) return quoteStillToDo(question, stops);
  if (!wantsDiscount(question)) return false;
  const typed = stops.some((stop) => stop.kind === "type" && /discount/i.test(`${stop.target} ${stop.label}`) && stop.text.trim());
  const saved = stops.some((stop) => stop.kind === "click" && stop.allow && /save/i.test(`${stop.target} ${stop.label}`));
  return !typed || !saved;
}

export function prepareStops(question: string, stops: Stop[], controls: Control[], facts: Fact[] = [], path = "") {
  const next = stops.map((stop) => normalizeDiscount(question, stop));
  const url = dealUrl(question);
  const missing = next.some((stop) => stop.allow && stop.kind !== "show" && !controlHere(stop.target, controls));
  const alreadyGoing = next.some((stop) => /^url:/i.test(stop.target));
  const planned = !url || !missing || alreadyGoing || !wantsDiscount(question) || quoteRequest(question) ? next : [openDeal(url), ...next];
  return ensureQuote(question, ensureAccount(question, planned, controls, facts, path), controls, facts, path);
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
export function accountRequest(question: string) {
  if (/\bhow\b/i.test(question)) return false;
  if (restaurantName(question) === "") return false;
  if (/\bonboard\b/i.test(question)) return true;
  return /\b(add|create|make|open)\b/i.test(question) && /\b(account|restaurant)\b/i.test(question);
}

function restaurantName(question: string) {
  const words = "[A-Za-z][A-Za-z0-9'&.-]*(?:\\s+[A-Za-z][A-Za-z0-9'&.-]*){0,3}";
  const match = question.match(new RegExp(`\\b(?:called|named)\\s+(${words})`, "i"))
    ?? question.match(new RegExp(`\\bonboard\\s+(?:a\\s+|an\\s+|the\\s+)?(?:new\\s+)?(?:restaurant|account\\s+)?(${words})`, "i"));
  return match?.[1]?.replace(/\s+(?:at|in|near)\s+[A-Za-z].*$/i, "").replace(/\s+(?:at|in|near|zip|with|for|and)$/i, "").trim() ?? "";
}

function restaurantZip(question: string) {
  return question.match(/\b(\d{5})(?:-\d{4})?\b/)?.[1] ?? "";
}

function controlValue(controls: Control[], id: string) {
  return controls.find((control) => (control.id ?? "").toLowerCase() === id)?.value?.trim() ?? "";
}

export function accountStillToDo(question: string, stops: Stop[]) {
  const name = restaurantName(question).toLowerCase();
  const named = stops.some((stop) => stop.kind === "type" && stop.target === "new-account-name" && stop.text.trim().toLowerCase() === name);
  const zip = restaurantZip(question);
  if (!zip) return !named || !stops.some((stop) => /zip/i.test(stop.say));
  const zipped = stops.some((stop) => stop.kind === "type" && stop.target === "new-account-zip" && stop.text.trim() === zip);
  const created = stops.some((stop) => stop.kind === "click" && stop.allow && stop.target === "new-account-submit");
  return !named || !zipped || !created;
}

export function accountSlug(question: string) {
  return restaurantName(question).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function accountPageReady(question: string, controls: Control[], facts: Fact[], path = "") {
  const name = restaurantName(question);
  if (!name) return false;
  const slug = accountSlug(question);
  const checklist = controls.some((control) => {
    const id = (control.id ?? "").toLowerCase();
    return id === "onboarding-checklist" || id === "add-buyer" || id === "activate-account";
  });
  const named = facts.some((fact) => fact.text.toLowerCase().includes(name.toLowerCase()));
  const here = path === `/accounts/${slug}` || path.startsWith(`/accounts/${slug}-`);
  return checklist && (named || here);
}

export function onboardingSubmit(target: string) {
  return /^(add-buyer|add-ap-contact|confirm-territory|set-price-book|set-delivery-days|set-tax|apply-credit|activate-account)-submit$/.test(target);
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

// Open the dialog, type the name and ZIP, and create. The ZIP fills in the rest.
function ensureAccount(question: string, stops: Stop[], controls: Control[], _facts: Fact[], _path: string) {
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

const nameSkip = /^(pipeline|pipelines|product|products|quote|quotes|discount|quantity|qty|tab|tabs|save|send|the|a|an|cap|button|dropdown|percent|and|then|from|set|click|open|for|to)$/i;

function takeName(raw: string) {
  const words = raw.replace(/[’]/g, "'").split(/\s+/).filter(Boolean);
  while (words.length > 0 && (nameSkip.test(words[0]) || /^\d+$/.test(words[0]))) words.shift();
  while (words.length > 0 && (nameSkip.test(words[words.length - 1]) || /^\d+$/.test(words[words.length - 1]))) words.pop();
  return words.join(" ");
}

function foldName(text: string) {
  return text.toLowerCase().replace(/['’]/g, "");
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function foldSlug(text: string) {
  return foldName(text).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// The restaurant in "open Papa John's" or "quote for dominos". "to the pipeline" is not one.
export function restaurantOf(question: string) {
  const text = question.replace(/[’]/g, "'");
  const pattern = /\b(?:for|open|quote|to)\s+(?:the\s+)?([a-z0-9']+(?:\s+[a-z0-9']+){0,3})/gi;
  let found = "";
  for (const match of text.matchAll(pattern)) {
    const cut = match[1].split(/\s+\b(?:with|add|select|quantity|qty|discount|at|and|then)\b/i)[0] ?? "";
    const name = takeName(cut);
    if (name) found = name;
  }
  return found;
}

export function productOf(question: string) {
  const text = question.replace(/[’]/g, "'");
  const pattern = /\b(?:add|select|with)\s+(?:a\s+|the\s+)?(?:product\s+)?([a-z][a-z0-9']*)/gi;
  let found = "";
  for (const match of text.matchAll(pattern)) {
    const name = takeName(match[1] ?? "");
    if (name && !/^products?$/i.test(name)) found = name;
  }
  return found;
}

export function quantityOf(question: string) {
  return question.match(/\b(?:quantity|qty)\s+(\d+)/i)?.[1] ?? "1";
}

export function discountOf(question: string) {
  return question.match(/(\d+)\s*(?:%|percent)/i)?.[1]
    ?? question.match(/\bdiscount(?:\s+cap)?(?:\s+to|\s+of|\s+at)?\s+(\d+)/i)?.[1]
    ?? "";
}

// A second request, after the restaurant exists: open its deal, add a product, save a discount, send.
export function quoteRequest(question: string) {
  if (/\bhow\b/i.test(question)) return false;
  if (accountRequest(question)) return false;
  if (!/\b(quote|product|send|discount)\b/i.test(question)) return false;
  return restaurantOf(question) !== "" && productOf(question) !== "" && discountOf(question) !== "";
}

export function quoteStillToDo(_question: string, stops: Stop[]) {
  const clicked = (target: string) => stops.some((stop) => stop.kind === "click" && stop.allow && stop.target === target);
  return !clicked("send-quote") || !clicked("tab-quotes");
}

function controlById(controls: Control[], id: string) {
  return controls.find((control) => (control.id ?? "").toLowerCase() === id.toLowerCase());
}

// The next few steps from whatever page is open. The restaurant name is whoever he said.
function ensureQuote(question: string, stops: Stop[], controls: Control[], facts: Fact[], path: string) {
  if (!quoteRequest(question)) return stops;
  const name = restaurantOf(question);
  const product = productOf(question);
  const qty = quantityOf(question);
  const discount = discountOf(question);
  const onDeal = path.split("?")[0].startsWith("/opportunities/");
  if (!onDeal) {
    const openedPipeline = stops.some((stop) => /^url:\/pipeline\b/i.test(stop.target));
    const searching = openedPipeline || (path.startsWith("/pipeline") && foldName(safeDecode(path)).includes(foldName(name)));
    if (!searching) return [accountStop("click", `url:/pipeline?q=${encodeURIComponent(name)}`, `Opening Pipeline for ${name}.`)];
    const dealId = `deal-${foldSlug(name)}`;
    const deal = controls.find((control) => {
      const id = (control.id ?? "").toLowerCase();
      if (!id.startsWith("deal-") || id.startsWith("deal-unready")) return false;
      return id === dealId || foldName(control.label).includes(foldName(name));
    });
    if (deal?.id) return [accountStop("click", deal.id, `Opening ${name}.`)];
    if (controlById(controls, "new-opportunity-submit")) {
      const steps: Stop[] = [];
      if (!foldName(controlById(controls, "new-opportunity-accountId")?.value ?? "").includes(foldName(name))) {
        steps.push(accountStop("type", "new-opportunity-accountId", `Choosing ${name}.`, name));
      }
      steps.push(accountStop("click", "new-opportunity-submit", `Creating the ${name} deal.`));
      return steps.slice(0, 3);
    }
    return [accountStop("click", "new-opportunity", `Opening a new deal for ${name}.`)];
  }
  if (controlById(controls, "add-product-submit")) {
    return [
      accountStop("type", "add-product-productId", `Choosing ${product}.`, product),
      accountStop("type", "add-product-quantity", `Setting the quantity to ${qty}.`, qty),
      accountStop("click", "add-product-submit", `Adding ${product}.`),
    ];
  }
  const lined = facts.some((fact) => fact.id === "lines" && foldName(fact.text).includes(foldName(product)));
  if (!lined) {
    if (!path.includes("tab=products")) return [accountStop("click", "tab-products", "Opening Products.")];
    return [accountStop("click", "add-product", "Opening the product form.")];
  }
  const saved = facts.some((fact) => fact.id === "saved-discount" && foldName(fact.text).includes(`discount ${discount}%`));
  if (!saved) {
    const steps: Stop[] = [];
    if ((controlById(controls, "discount")?.value ?? "") !== discount) {
      steps.push(accountStop("type", "discount", `Setting the discount to ${discount}%.`, discount));
    }
    steps.push(accountStop("click", "save-discount", "Saving the discount."));
    return steps.slice(0, 3);
  }
  const sent = stops.some((stop) => stop.kind === "click" && stop.allow && stop.target === "send-quote");
  if (!sent) return [accountStop("click", "send-quote", "Sending the quote.")];
  return [accountStop("click", "tab-quotes", "Opening Quotes.")];
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
  if (wantsDiscount(question) || accountRequest(question) || quoteRequest(question)) return !stillToDo(question, played);
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
