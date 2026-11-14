import { addDays, money, nextNumberedId, round2, today } from "../../data";
import { logActivity } from "../activity";
import { requestApproval } from "../approvals";
import { clearHold, releaseBlocker } from "../credit";
import { find, num, type Db } from "../db";
import { invoiceBalance } from "../money";
import { accountReason, financeCheck } from "../permissions";
import { must, refuse } from "../refused";
import { allocateLines } from "../stock";
import { dollars, required, wholeNumber, type Action } from "./types";

// Workflow 3: an overdue invoice puts the account on hold; a plan and a payment take it off.

async function invoiceContext(db: Db, invoiceId: string) {
  const invoice = await find(db, "invoices.json", invoiceId);
  if (!invoice) refuse("That invoice was not found.");
  const account = await find(db, "accounts.json", invoice.accountId);
  return { invoice, account };
}

export async function livePlan(db: Db, invoiceId: unknown) {
  return (await db.rows("payment-plans.json")).find((row) => row.invoiceId === invoiceId && (row.status === "pending approval" || row.status === "active"));
}

export const proposePlan: Action = async ({ db, person, values }) => {
  const { invoice, account } = await invoiceContext(db, values.invoiceId);
  must(await accountReason(db, person, account));
  const balance = invoiceBalance(invoice);
  if (balance <= 0) refuse("This invoice has nothing left to pay.");
  const existing = await livePlan(db, invoice.id);
  if (existing) refuse(`${invoice.id} already has a payment plan that is ${existing.status}.`);
  const installments = wholeNumber(values.installments, "Pick 2 to 6 installments.", 2);
  if (installments > 6) refuse("Pick 2 to 6 installments.");
  const firstDate = required(values.firstDate, "Pick the first payment date.");
  if (firstDate < today() || firstDate > addDays(today(), 30)) refuse("The first installment has to fall within the next 30 days.");
  const rules = await db.rules();
  const plans = await db.rows("payment-plans.json");
  const id = nextNumberedId("plan", plans);
  const needsApproval = balance > rules.paymentPlanApprovalOverDollars || installments > rules.paymentPlanMaxInstallmentsWithoutApproval;
  const plan = { id, accountId: invoice.accountId, invoiceId: invoice.id, total: balance, installments, firstDate, status: needsApproval ? "pending approval" : "active", approvalId: "", by: person.id, at: new Date().toISOString() };
  plans.push(plan);
  await logActivity(db, { subjectType: "invoice", subjectId: String(invoice.id), accountId: String(invoice.accountId), by: person.id, text: `${person.name} proposed ${installments} payments of about ${money(round2(balance / installments))} starting ${firstDate}.` });
  if (!needsApproval) return { id, message: "Payment plan is active." };
  const { approval, message } = await requestApproval(db, person, { kind: "payment plan", subjectType: "payment-plan", subjectId: id, accountId: String(invoice.accountId), amount: balance, note: `${installments} installments on ${invoice.id}` });
  plan.approvalId = String(approval.id);
  return { id, message };
};

export const recordPayment: Action = async ({ db, person, values }) => {
  must(financeCheck(person));
  const { invoice } = await invoiceContext(db, values.invoiceId);
  const balance = invoiceBalance(invoice);
  if (balance <= 0) refuse("This invoice is already paid.");
  const amount = dollars(values.amount, "Enter the amount received.");
  if (amount > balance) refuse(`That is more than the ${money(balance)} left on ${invoice.id}.`);
  const method = required(values.method, "Pick how they paid.");
  const payments = await db.rows("payments.json");
  const id = nextNumberedId("pay", payments);
  payments.push({ id, invoiceId: invoice.id, accountId: invoice.accountId, amount, method, reference: values.reference ?? "", by: person.id, at: new Date().toISOString() });
  invoice.paid = round2(num(invoice.paid) + amount);
  if (invoiceBalance(invoice) <= 0) {
    invoice.status = "paid";
    const plan = await livePlan(db, invoice.id);
    if (plan?.status === "active") plan.status = "completed";
  }
  await logActivity(db, { subjectType: "invoice", subjectId: String(invoice.id), accountId: String(invoice.accountId), by: person.id, text: `${person.name} recorded a ${money(amount)} ${method} payment on ${invoice.id}.` });
  return { id, message: `Recorded ${money(amount)}.` };
};

export const placeHold: Action = async ({ db, person, values }) => {
  must(financeCheck(person));
  const account = await find(db, "accounts.json", values.accountId);
  if (!account) refuse("That restaurant was not found.");
  if (account.creditHold === "yes") refuse(`${account.name} is already on credit hold.`);
  const reason = required(values.reason, "Say why the account is going on hold.");
  account.creditHold = "yes";
  account.holdReason = reason;
  account.holdSince = today();
  const held = (await db.rows("orders.json")).filter((row) => row.accountId === account.id && (row.status === "open" || row.status === "backordered"));
  for (const order of held) {
    order.status = "held";
    order.holdReason = reason;
  }
  await logActivity(db, { subjectType: "account", subjectId: String(account.id), accountId: String(account.id), by: person.id, text: `${person.name} put ${account.name} on credit hold: ${reason}${held.length ? ` ${held.length} open order${held.length === 1 ? " is" : "s are"} held.` : ""}` });
  return { message: `${account.name} is on credit hold.` };
};

export const requestRelease: Action = async ({ db, person, values }) => {
  const account = await find(db, "accounts.json", values.accountId);
  if (!account) refuse("That restaurant was not found.");
  must(await accountReason(db, person, account));
  if (account.creditHold !== "yes") refuse(`${account.name} is not on credit hold.`);
  must(await releaseBlocker(db, account));
  const { message } = await requestApproval(db, person, { kind: "hold release", subjectType: "account", subjectId: String(account.id), accountId: String(account.id), amount: 0, note: values.note ?? "" });
  return { message };
};

export const releaseHold: Action = async ({ db, person, values }) => {
  must(financeCheck(person));
  const account = await find(db, "accounts.json", values.accountId);
  if (!account) refuse("That restaurant was not found.");
  if (account.creditHold !== "yes") refuse(`${account.name} is not on credit hold.`);
  must(await releaseBlocker(db, account));
  await clearHold(db, account, person);
  const waiting = (await db.rows("approvals.json")).find((row) => row.kind === "hold release" && row.subjectId === account.id && row.status === "pending");
  if (waiting) {
    waiting.status = "approved";
    waiting.decidedBy = person.id;
    waiting.decidedAt = new Date().toISOString();
  }
  return { message: "Hold released. Release held orders one by one." };
};

export const releaseOrder: Action = async ({ db, person, values }) => {
  const order = await find(db, "orders.json", values.orderId);
  if (!order) refuse("That order was not found.");
  const account = await find(db, "accounts.json", order.accountId);
  must(await accountReason(db, person, account));
  if (order.status !== "held") refuse(`${order.id} is ${order.status}, not held.`);
  if (account?.creditHold === "yes") refuse(`${account.name} is still on credit hold.`);
  const lines = (await db.rows("order-lines.json")).filter((row) => row.orderId === order.id);
  order.status = lines.length ? await allocateLines(db, account, lines) : "open";
  if (lines[0]?.warehouseId) order.warehouseId = lines[0].warehouseId;
  order.holdReason = "";
  await logActivity(db, { subjectType: "order", subjectId: String(order.id), accountId: String(order.accountId), by: person.id, text: `${person.name} released ${order.id}. It is ${order.status}.` });
  return { message: `${order.id} is ${order.status}.` };
};
