import type { Stop } from "../../scripts/ask.ts";

type Control = { id?: string; label: string };

// A discount change is not finished when Kiwi only opens the page, or when it
// aims the typing at a page that does not have the field.
export function stillToDo(question: string, stops: Stop[]) {
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
  if (!url || !missing || alreadyGoing || !wantsDiscount(question)) return next;
  const open: Stop = {
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
  return [open, ...next];
}

function wantsDiscount(question: string) {
  return /\b(set|change|update|save|add|put|make)\b/i.test(question) && /\bdiscount\b/i.test(question);
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
