import { money, nextNumberedId, prettyDate, round2, today, type Row } from "../../data";
import { logActivity } from "../activity";
import { postCreditMemo, requestApproval } from "../approvals";
import { find, num, type Db } from "../db";
import { deliveryDates, accountDays, invoiceBalance } from "../money";
import { accountReason } from "../permissions";
import { must, refuse } from "../refused";
import { freeForAccount } from "../stock";
import { required, wholeNumber, type Action } from "./types";

// Workflow 1: a delivery came short. Report it, redeliver what is free, credit the rest, close the case.

export async function pendingMemoFor(db: Db, shipmentLineId: string) {
  return (await db.rows("credit-memos.json")).find((row) => row.shipmentLineId === shipmentLineId && row.status === "pending approval");
}

// Short that has neither a redelivery nor a credit (posted or waiting) against it.
export async function openShort(db: Db, line: Row) {
  const pending = (await db.rows("credit-memos.json"))
    .filter((row) => row.shipmentLineId === line.id && row.status === "pending approval")
    .reduce((sum, row) => sum + num(row.quantity), 0);
  return Math.max(0, num(line.short) - num(line.redelivered) - num(line.credited) - pending);
}

async function lineContext(db: Db, shipmentLineId: string) {
  const line = await find(db, "shipment-lines.json", shipmentLineId);
  if (!line) refuse("That shipment line was not found.");
  const shipment = await find(db, "shipments.json", line.shipmentId);
  if (!shipment) refuse("That shipment was not found.");
  const account = await find(db, "accounts.json", shipment.accountId);
  const product = await db.name(line.productId);
  return { line, shipment, account, product };
}

export const reportShort: Action = async ({ db, person, values }) => {
  const { line, shipment, account, product } = await lineContext(db, values.shipmentLineId);
  must(await accountReason(db, person, account));
  if (shipment.status !== "delivered") refuse("Only a delivered shipment can be reported short.");
  const remaining = num(line.quantity) - num(line.short);
  if (remaining <= 0) refuse(`All ${line.quantity} ${product} on this line are already reported short.`);
  const short = wholeNumber(values.short, "Enter how many were short.");
  if (short > remaining) refuse(`Only ${remaining} ${product} can still be reported short on this line.`);
  line.short = num(line.short) + short;
  const cases = await db.rows("cases.json");
  for (const row of cases.filter((item) => item.shipmentId === shipment.id && item.status === "open")) row.status = "investigating";
  await logActivity(db, { subjectType: "shipment", subjectId: String(shipment.id), accountId: String(shipment.accountId), by: person.id, text: `${person.name} reported ${short} ${product} short on ${shipment.id}.` });
  return { message: `Reported ${short} ${product} short.` };
};

export const scheduleRedelivery: Action = async ({ db, person, values }) => {
  const { line, shipment, account, product } = await lineContext(db, values.shipmentLineId);
  must(await accountReason(db, person, account));
  const open = await openShort(db, line);
  if (open === 0) refuse(num(line.redelivered) > 0 ? `Those ${line.redelivered} ${product} are already on a redelivery.` : `Nothing on the ${product} line is waiting for a redelivery.`);
  const quantity = wholeNumber(values.quantity, "Enter how many to redeliver.");
  if (quantity > open) refuse(`Only ${open} ${product} are still open on this line.`);
  const best = await freeForAccount(db, account, String(line.productId));
  if (best.free < quantity) refuse(`Only ${best.free} ${product} free at ${best.warehouseName}.`);
  const rules = await db.rules();
  const dates = deliveryDates(account, rules);
  if (!dates.includes(values.date)) refuse(`${account?.name} gets deliveries on ${accountDays(account, rules).join(" and ")} only. Pick one of the next delivery dates.`);
  const shipments = await db.rows("shipments.json");
  const id = nextNumberedId("shipment", shipments);
  shipments.push({ id, orderId: shipment.orderId, accountId: shipment.accountId, warehouseId: best.warehouseId, status: "scheduled", deliveryDate: values.date, redeliveryOf: shipment.id });
  (await db.rows("shipment-lines.json")).push({ id: `sl-${id}-1`, shipmentId: id, productId: line.productId, quantity, short: 0, redelivered: 0, credited: 0 });
  line.redelivered = num(line.redelivered) + quantity;
  await logActivity(db, { subjectType: "shipment", subjectId: String(shipment.id), accountId: String(shipment.accountId), by: person.id, text: `${person.name} scheduled ${quantity} ${product} on ${id} for ${prettyDate(values.date)}.` });
  return { id, message: `Redelivery scheduled for ${prettyDate(values.date)}.` };
};

export const issueCredit: Action = async ({ db, person, values }) => {
  const { line, shipment, account, product } = await lineContext(db, values.shipmentLineId);
  const invoice = await find(db, "invoices.json", values.invoiceId);
  if (!invoice) refuse("That invoice was not found.");
  must(await accountReason(db, person, account));
  if (invoice.orderId !== shipment.orderId) refuse(`${invoice.id} is not the invoice for ${shipment.id}.`);
  const waiting = await pendingMemoFor(db, String(line.id));
  const open = await openShort(db, line);
  if (open === 0) {
    if (waiting) refuse(`A credit for ${product} is already waiting on ${await db.name((await find(db, "approvals.json", waiting.approvalId))?.approverId)}.`);
    if (num(line.redelivered) > 0 && num(line.credited) === 0) refuse(`Those ${line.redelivered} ${product} are already on a redelivery.`);
    refuse(num(line.short) === 0 ? `Report the ${product} short on the shipment first.` : `Every short ${product} already has a redelivery or a credit.`);
  }
  const quantity = wholeNumber(values.quantity, "Enter how many to credit.");
  if (quantity > open) refuse(num(line.redelivered) > 0 ? `Only ${open} ${product} are open. The other ${line.redelivered} are already on a redelivery.` : `Only ${open} ${product} are still open on this line.`);
  const orderLine = (await db.rows("order-lines.json")).find((row) => row.orderId === shipment.orderId && row.productId === line.productId);
  const unitPrice = num(orderLine?.unitPrice ?? (await find(db, "products.json", line.productId))?.price);
  const amount = round2(quantity * unitPrice);
  const balance = invoiceBalance(invoice);
  if (amount > balance) refuse(`That credit is ${money(amount)}, more than the ${money(balance)} left on ${invoice.id}.`);
  const memos = await db.rows("credit-memos.json");
  const id = nextNumberedId("cm", memos);
  const memo: Row = {
    id,
    invoiceId: invoice.id,
    accountId: invoice.accountId,
    caseId: (await db.rows("cases.json")).find((row) => row.shipmentId === shipment.id)?.id ?? "",
    shipmentLineId: line.id,
    productId: line.productId,
    quantity,
    amount,
    reason: values.reason || "short delivery",
    status: "pending approval",
    approvalId: "",
    by: person.id,
    at: new Date().toISOString(),
  };
  memos.push(memo);
  const rules = await db.rules();
  await logActivity(db, { subjectType: "invoice", subjectId: String(invoice.id), accountId: String(invoice.accountId), by: person.id, text: `${person.name} issued ${id.toUpperCase()} for ${quantity} ${product} (${money(amount)}).` });
  if (amount > rules.creditApprovalOverDollars) {
    const { approval, message } = await requestApproval(db, person, { kind: "credit", subjectType: "credit-memo", subjectId: id, accountId: String(invoice.accountId), amount, note: `${quantity} ${product} short on ${shipment.id}` });
    memo.approvalId = approval.id;
    return { id, message };
  }
  await postCreditMemo(db, memo);
  return { id, message: `Posted a ${money(amount)} credit to ${invoice.id}.` };
};

export const resolutions = ["redelivered", "credited", "both", "no action"];

export const closeCase: Action = async ({ db, person, values }) => {
  const row = await find(db, "cases.json", values.caseId);
  if (!row) refuse("That case was not found.");
  must(await accountReason(db, person, String(row.accountId)));
  if (row.status === "closed") refuse("This case is already closed.");
  if (row.shipmentId) {
    const lines = (await db.rows("shipment-lines.json")).filter((line) => line.shipmentId === row.shipmentId);
    for (const line of lines) {
      const open = await openShort(db, line);
      if (open > 0) refuse(`${await db.name(line.productId)} still has ${open} short with no redelivery or credit.`);
    }
    for (const line of lines) {
      const waiting = await pendingMemoFor(db, String(line.id));
      if (waiting) refuse(`Waiting on ${await db.name((await find(db, "approvals.json", waiting.approvalId))?.approverId)} to approve ${String(waiting.id).toUpperCase()}.`);
    }
  }
  const resolution = required(values.resolution, "Pick a resolution.");
  if (!resolutions.includes(resolution)) refuse("Pick a resolution.");
  row.status = "closed";
  row.resolution = resolution;
  row.closedAt = today();
  await logActivity(db, { subjectType: "case", subjectId: String(row.id), accountId: String(row.accountId), by: person.id, text: `${person.name} closed ${row.id} (${resolution}).` });
  return { message: "Case closed." };
};

export const callOutcomes = ["promised to pay", "dispute", "no answer", "left message", "resolved", "follow up"];

const subjectFiles: Record<string, string> = { case: "cases.json", invoice: "invoices.json", account: "accounts.json", opportunity: "opportunities.json", shipment: "shipments.json", order: "orders.json" };

export const logCall: Action = async ({ db, person, values }) => {
  const file = subjectFiles[values.subjectType];
  const subject = file ? await find(db, file, values.subjectId) : undefined;
  if (!subject) refuse("That record was not found.");
  const accountId = String(values.subjectType === "account" ? subject.id : subject.accountId);
  must(await accountReason(db, person, accountId));
  const outcome = required(values.outcome, "Pick how the call went.");
  if (!callOutcomes.includes(outcome)) refuse("Pick how the call went.");
  const note = required(values.text, "Add a note about the call.");
  await logActivity(db, { subjectType: values.subjectType, subjectId: String(subject.id), accountId, by: person.id, kind: "call", outcome, text: note });
  return { message: "Call logged." };
};
