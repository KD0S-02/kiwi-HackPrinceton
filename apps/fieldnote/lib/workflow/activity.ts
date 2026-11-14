import { nextNumberedId, type Row } from "../data";
import type { Db } from "./db";

export type ActivityEntry = {
  subjectType: string;
  subjectId: string;
  accountId?: string;
  text: string;
  by?: string;
  kind?: "note" | "call" | "system";
  outcome?: string;
};

// Appends one timeline row. Every workflow action writes one "system" line.
export async function logActivity(db: Db, entry: ActivityEntry) {
  const activity = await db.rows("activity.json");
  const row: Row = {
    id: nextNumberedId("act", activity),
    subjectType: entry.subjectType,
    subjectId: entry.subjectId,
    accountId: entry.accountId ?? "",
    text: entry.text,
    by: entry.by ?? "",
    at: new Date().toISOString(),
    kind: entry.kind ?? "system",
    outcome: entry.outcome ?? "",
  };
  if (entry.subjectType === "opportunity") row.opportunityId = entry.subjectId;
  activity.push(row);
  return row;
}

// Timeline rows for a record, newest first. Legacy rows only carry opportunityId or accountId.
export function activityFor(activity: Row[], subjectType: string, subjectId: string) {
  return activity
    .filter((row) => (row.subjectType === subjectType && row.subjectId === subjectId) || (subjectType === "opportunity" && row.opportunityId === subjectId))
    .sort(newestFirst);
}

export function accountActivity(activity: Row[], accountId: string, opportunityIds: string[] = []) {
  return activity
    .filter((row) => row.accountId === accountId || opportunityIds.includes(String(row.opportunityId ?? "")) || (row.subjectType === "account" && row.subjectId === accountId))
    .sort(newestFirst);
}

function newestFirst(a: Row, b: Row) {
  return String(b.at ?? "").localeCompare(String(a.at ?? "")) || String(b.id).localeCompare(String(a.id), undefined, { numeric: true });
}
