import type { Stop } from "../../scripts/ask.ts";
import type { PageControl } from "./bridge.ts";

const filler = new Set([
  "a", "an", "the", "is", "are", "where", "whats", "what", "show", "me", "find", "point", "to", "at", "open", "go",
  "take", "click", "press", "switch", "please", "kiwi", "can", "you", "could", "i", "how", "do", "my", "of", "on",
  "in", "page", "tab", "button", "link", "screen", "section", "hey", "for", "get", "it", "this", "that", "and",
  "navigate", "bring", "up", "pull", "see", "view", "let", "lets", "us",
]);

const risky = new Set(["send-quote", "save-discount", "discount"]);

function words(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
}

function score(object: string[], label: string) {
  const labelWords = words(label);
  if (labelWords.length === 0) return 0;
  const hits = object.filter((word) => labelWords.some((labelWord) => labelWord === word || (word.length > 3 && labelWord.startsWith(word))));
  if (hits.length === object.length) return hits.length / labelWords.length;
  // "where do I log a cycle count" still means the Cycle count button.
  if (hits.length >= 2 && hits.length === labelWords.length && hits.length / object.length >= 0.6) return 0.5;
  return 0;
}

// Answers "where is X", "show me X" and "open X" without the model when X is plainly on the page.
// Anything about discounts, sending, approvals, or "why" goes to the model, which knows the rules.
export function route(
  question: string,
  controls: PageControl[],
  tabs: { title: string }[],
  facts: { id: string; text: string }[] = [],
): Stop | undefined {
  const all = words(question);
  const sendQuote = controls.find((control) => control.id === "send-quote");
  const quoteReason = facts.find((fact) => fact.id === "quote-message")?.text;
  if (all.includes("quote") && sendQuote?.disabled && quoteReason && !all.some((word) => ["discount", "set", "change", "type", "approve", "approval"].includes(word))) {
    return { screen: 0, x: 0, y: 0, draw: "circle", text: "", label: "Send Quote", say: `Send Quote is off. ${quoteReason}`, allow: false, kind: "show", target: "send-quote" };
  }
  if (all.some((word) => ["why", "discount", "approve", "approval", "set", "change", "type", "can", "cant", "should", "tour", "walk", "usually", "order", "orders", "stock"].includes(word))) {
    return undefined;
  }
  const show = all.some((word) => ["where", "show", "find", "point", "whats", "see", "how"].includes(word));
  const filtering = ["only", "with", "over", "under", "more", "less", "than", "which", "list", "filter", "filtered", "sort", "sorted", "by", "from",
    "closed", "paid", "delivered", "pending", "picking", "received", "low", "mine", "everyone", "proposal", "qualify", "commit",
    "new", "create", "add", "edit", "delete", "remove", "rename", "update", "cases", "invoices", "shipments", "products", "suppliers", "deals"];
  if (all.some((word) => filtering.includes(word)) || (show && all.includes("open"))) return undefined;
  const click = all.some((word) => ["open", "go", "take", "click", "press", "switch", "navigate", "bring"].includes(word));
  if (!show && !click) return undefined;

  if (show && !click && all.includes("quote")) {
    if (!sendQuote) return undefined;
    const say = "Send Quote is right here.";
    return { screen: 0, x: 0, y: 0, draw: "circle", text: "", label: "Send Quote", say, allow: false, kind: "show", target: "send-quote" };
  }
  if (all.includes("send") || all.includes("quote")) return undefined;
  const object = all.filter((word) => !filler.has(word));
  if (object.length === 0 || object.length > 4) return undefined;

  const wantsTab = all.includes("tab");
  const tabMatch = tabs
    .map((tab) => ({ tab, value: score(object, tab.title) }))
    .filter((match) => match.value > 0)
    .sort((a, b) => b.value - a.value)[0];
  const controlMatch = controls
    .filter((control) => !risky.has(control.id))
    .map((control) => ({ control, value: Math.max(score(object, control.label), control.id ? score(object, control.id.replace(/-/g, " ")) : 0) }))
    .filter((match) => match.value > 0)
    .sort((a, b) => b.value - a.value)[0];

  const base = { screen: 0, x: 0, y: 0, draw: "circle" as const, text: "" };
  if (tabMatch && (wantsTab || !controlMatch) && click) {
    return { ...base, label: tabMatch.tab.title, say: `Switching to ${tabMatch.tab.title}.`, allow: true, kind: "click", target: `tab:${tabMatch.tab.title}` };
  }
  if (!controlMatch) return undefined;
  const { control } = controlMatch;
  if (click && control.disabled) return undefined;
  const target = control.id || control.label;
  if (click && !show) {
    return { ...base, label: control.label, say: `Opening ${control.label}.`, allow: true, kind: "click", target };
  }
  return { ...base, label: control.label, say: `${control.label} is right here.`, allow: false, kind: "show", target };
}
