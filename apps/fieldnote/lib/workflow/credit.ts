import { money, today, type Row } from "../data";
import type { Person } from "../people";
import { logActivity } from "./activity";
import { num, type Db } from "./db";
import { availableCredit, invoiceBalance, isPastDue, paidOn, planSchedule } from "./money";

// Rules shared by orders, quotes and the credit-hold workflow.

// Why a new order for this account would be refused, or "" when it may go ahead.
export async function orderBlocker(db: Db, account: Row, amount: number) {
  const name = String(account.name);
  if (account.status && account.status !== "active") {
    if (!account.territoryId) return `No territory covers ZIP ${account.zip || "(none)"}. Ask your manager.`;
    return `${name} is not active yet.`;
  }
  if (account.creditHold === "yes") return `${name} is on credit hold: ${String(account.holdReason || "an invoice is past due.")}`;
  const available = await availableCredit(db, account);
  if (amount > available) return `This order is ${money(amount - available)} over ${name}'s available credit.`;
  return "";
}

export async function pastDueInvoices(db: Db, accountId: string) {
  const rules = await db.rules();
  return (await db.rows("invoices.json")).filter((row) => row.accountId === accountId && isPastDue(row, rules));
}

// A hold can come off when every past-due invoice is paid, or is on an active plan whose first
// installment is paid. Returns the first reason it cannot, or "".
export async function releaseBlocker(db: Db, account: Row) {
  const plans = await db.rows("payment-plans.json");
  for (const invoice of await pastDueInvoices(db, String(account.id))) {
    if (invoiceBalance(invoice) <= 0) continue;
    const plan = plans.find((row) => row.invoiceId === invoice.id && row.status === "active");
    if (!plan) return `${invoice.id} is still past due with no active payment plan.`;
    const [first] = planSchedule(plan, await paidOn(db, String(invoice.id)));
    if (!first?.paid) return `${invoice.id} is on a payment plan, but the first installment is not paid yet.`;
  }
  return "";
}

// Clears the hold fields. Held orders stay held until someone releases them.
export async function clearHold(db: Db, account: Row, person: Person) {
  account.creditHold = "";
  account.holdReason = "";
  account.holdSince = "";
  await logActivity(db, { subjectType: "account", subjectId: String(account.id), accountId: String(account.id), by: person.id, text: `${person.name} released the credit hold on ${account.name}.` });
}

export function holdLabel(account: Row) {
  return account.creditHold === "yes" ? `On hold since ${String(account.holdSince || today())}` : "";
}

export { num };
