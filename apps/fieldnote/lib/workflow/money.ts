import { addDays, dayName, daysBetween, money, round2, today, type Row, type Rules } from "../data";
import { find, num, type Db } from "./db";

// Money values computed from the records, never stored.

export function invoiceBalance(invoice: Row) {
  return Math.max(0, round2(num(invoice.amount) - num(invoice.paid) - num(invoice.credited)));
}

export async function accountInvoices(db: Db, accountId: string) {
  return (await db.rows("invoices.json")).filter((row) => row.accountId === accountId);
}

export async function openBalance(db: Db, accountId: string) {
  return round2((await accountInvoices(db, accountId)).reduce((sum, row) => sum + invoiceBalance(row), 0));
}

// Orders that are promised but not billed yet.
export async function committed(db: Db, accountId: string) {
  const [orders, invoices] = await Promise.all([db.rows("orders.json"), db.rows("invoices.json")]);
  const billed = new Set(invoices.map((row) => String(row.orderId)));
  return round2(
    orders
      .filter((row) => row.accountId === accountId && ["open", "held", "backordered", "picking"].includes(String(row.status)) && !billed.has(String(row.id)))
      .reduce((sum, row) => sum + num(row.amount), 0),
  );
}

export async function availableCredit(db: Db, account: Row) {
  const id = String(account.id);
  return round2(num(account.creditLimit) - (await openBalance(db, id)) - (await committed(db, id)));
}

export function daysPastDue(invoice: Row, day = today()) {
  if (!invoice.dueDate || invoiceBalance(invoice) <= 0) return 0;
  return Math.max(0, daysBetween(String(invoice.dueDate), day));
}

// Past due once the due date plus the grace period is behind us and money is still owed.
export function isPastDue(invoice: Row, rules: Rules, day = today()) {
  return invoiceBalance(invoice) > 0 && !!invoice.dueDate && addDays(String(invoice.dueDate), rules.holdAfterDaysPastDue) < day;
}

export const agingLabels = ["Current", "1–30", "31–60", "61–90", "90+"] as const;

export function agingBuckets(invoices: Row[], day = today()) {
  const buckets = [0, 0, 0, 0, 0];
  for (const invoice of invoices) {
    const balance = invoiceBalance(invoice);
    if (balance <= 0) continue;
    const late = daysPastDue(invoice, day);
    const index = late === 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : late <= 90 ? 3 : 4;
    buckets[index] = round2(buckets[index] + balance);
  }
  return agingLabels.map((label, index) => ({ label, amount: buckets[index] }));
}

// The account's price-book price, otherwise the list price.
export async function unitPriceFor(db: Db, account: Row | undefined, productId: string) {
  const entry = (await db.rows("price-book-entries.json")).find((row) => row.priceBookId === account?.priceBookId && row.productId === productId);
  if (entry) return num(entry.price);
  return num((await find(db, "products.json", productId))?.price);
}

export function linesTotal(lines: Row[]) {
  return round2(lines.reduce((sum, line) => sum + num(line.quantity) * num(line.unitPrice), 0));
}

export function quoteAmount(total: number, discountPercent: number) {
  return Math.round(total * (1 - discountPercent / 100));
}

export function accountDays(account: Row | undefined, rules: Rules) {
  const own = String(account?.deliveryDays ?? "");
  return (own || rules.deliveryDays[String(account?.territoryId ?? "")] || "").split("|").filter(Boolean);
}

// The next few dates after today that fall on the account's delivery days.
export function deliveryDates(account: Row | undefined, rules: Rules, count = 4, from = today()) {
  const days = accountDays(account, rules);
  const dates: string[] = [];
  for (let offset = 1; dates.length < count && offset < 60 && days.length > 0; offset += 1) {
    const day = addDays(from, offset);
    if (days.includes(dayName(day))) dates.push(day);
  }
  return dates;
}

export type Installment = { number: number; due: string; amount: number; paid: boolean };

// Equal installments every 14 days from the first date; any rounding goes on the last one.
// An installment is paid once payments on the invoice since the plan cover it.
export function planSchedule(plan: Row, paidSoFar: number): Installment[] {
  const count = Math.max(1, num(plan.installments));
  const total = num(plan.total);
  const each = Math.floor((total / count) * 100) / 100;
  let covered = 0;
  return Array.from({ length: count }, (_, index) => {
    const amount = index === count - 1 ? round2(total - each * (count - 1)) : each;
    covered = round2(covered + amount);
    return { number: index + 1, due: addDays(String(plan.firstDate), index * 14), amount, paid: paidSoFar >= covered - 0.005 };
  });
}

export async function paidOn(db: Db, invoiceId: string) {
  return round2((await db.rows("payments.json")).filter((row) => row.invoiceId === invoiceId).reduce((sum, row) => sum + num(row.amount), 0));
}

export { money };
