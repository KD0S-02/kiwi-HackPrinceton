import type { Person } from "../../people";
import type { Db } from "../db";
import { refuse } from "../refused";

export type Values = Record<string, string>;
export type ActionContext = { db: Db; person: Person; values: Values };
export type ActionResult = { id?: string; message: string };
export type Action = (context: ActionContext) => Promise<ActionResult>;

// A whole number from a form field, or a refusal with the given sentence.
export function wholeNumber(value: string | undefined, sentence: string, min = 1) {
  const parsed = Number(String(value ?? "").trim());
  if (!Number.isInteger(parsed) || parsed < min) refuse(sentence);
  return parsed;
}

export function dollars(value: string | undefined, sentence: string) {
  const parsed = Number(String(value ?? "").replace(/[$,\s]/g, ""));
  if (!Number.isFinite(parsed) || parsed <= 0) refuse(sentence);
  return Math.round(parsed * 100) / 100;
}

export function required(value: string | undefined, sentence: string) {
  const cleaned = String(value ?? "").trim();
  if (!cleaned) refuse(sentence);
  return cleaned;
}
