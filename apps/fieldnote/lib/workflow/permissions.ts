import type { Row } from "../data";
import type { Person } from "../people";
import { find, type Db } from "./db";

// Who may do what. Every check returns "" when allowed, or the one sentence the page and the
// server both show.
//
// | Action group                                   | AE (own) | Senior AE (team) | Owner (company) |
// | cases, shorts, credits, quotes, orders, plans… | own book | none (read only) | any account     |
// | decide approvals                               | no       | his approvals    | any approval    |
// | record payment, place or release hold          | no       | no               | yes             |
// | purchase orders, receiving, backorders         | no       | no               | yes             |

export type ActionGroup = "account" | "decide" | "finance" | "ops";
export type Check = { ok: true } | { ok: false; reason: string };

export const financeReason = "Finance posts payments. Ask Krishna Das.";
export const opsReason = "Account executives do not receive. Ops and the warehouse do.";

export async function accountReason(db: Db, person: Person, account: Row | string | undefined) {
  const row = typeof account === "string" ? await find(db, "accounts.json", account) : account;
  if (!row) return "That restaurant was not found.";
  if (person.book === "company" || row.ownerId === person.id) return "";
  return `${row.name} belongs to ${await db.name(row.ownerId)}.`;
}

export function financeCheck(person: Person) {
  return person.book === "company" ? "" : financeReason;
}

export function opsCheck(person: Person) {
  return person.book === "company" ? "" : opsReason;
}

export async function decideReason(db: Db, person: Person, approval: Row) {
  if (approval.requestedBy === person.id) return "You cannot decide your own request.";
  if (person.book === "company" || approval.approverId === person.id) return "";
  return `${await db.name(approval.approverId)} decides this request.`;
}

export async function can(db: Db, person: Person, group: ActionGroup, context: { account?: Row | string; approval?: Row } = {}): Promise<Check> {
  const reason =
    group === "account" ? await accountReason(db, person, context.account)
    : group === "decide" ? (context.approval ? await decideReason(db, person, context.approval) : "That request was not found.")
    : group === "finance" ? financeCheck(person)
    : opsCheck(person);
  return reason ? { ok: false, reason } : { ok: true };
}
