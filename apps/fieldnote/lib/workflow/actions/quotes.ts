import { addDays, money, nextNumberedId, prettyDate, today, type Row } from "../../data";
import type { Person } from "../../people";
import { logActivity } from "../activity";
import { orderBlocker } from "../credit";
import { find, num, type Db } from "../db";
import { deliveryDates, linesTotal, quoteAmount, unitPriceFor } from "../money";
import { accountReason } from "../permissions";
import { must, refuse } from "../refused";
import { allocateLines, freeForAccount } from "../stock";
import { required, type Action } from "./types";

// Workflow 2: build the quote from priced lines, send versions, accept one, convert it to an order.

async function opportunityContext(db: Db, opportunityId: unknown) {
  const opportunity = await find(db, "opportunities.json", opportunityId);
  if (!opportunity) refuse("Opportunity not found.");
  const account = await find(db, "accounts.json", opportunity.accountId);
  return { opportunity, account };
}

export async function linesOf(db: Db, opportunityId: string) {
  return (await db.rows("line-items.json")).filter((row) => row.opportunityId === opportunityId);
}

// The line's price, falling back to the account's price for lines added before prices were stored.
export async function priced(db: Db, account: Row | undefined, line: Row) {
  return line.unitPrice != null && line.unitPrice !== "" ? num(line.unitPrice) : unitPriceFor(db, account, String(line.productId));
}

// The first line that does not have enough free stock, as the sentence the page shows.
export async function shortLine(db: Db, account: Row | undefined, lines: Row[], suffix = " Substitute it or lower the quantity.") {
  for (const line of lines) {
    const best = await freeForAccount(db, account, String(line.productId));
    if (best.free < num(line.quantity)) return `${await db.name(line.productId)} is short: ${best.free} free for ${line.quantity} on this quote.${suffix}`;
  }
  return "";
}

// The cap passes when the discount is at or under the cap, or under a discount the approver allowed.
export function capReason(opportunity: Row, cap: number, person: Person) {
  const discount = num(opportunity.discountPercent);
  if (discount <= cap) return "";
  if (opportunity.approvedDiscountPercent != null && opportunity.approvedDiscountPercent !== "" && discount <= num(opportunity.approvedDiscountPercent)) return "";
  return `An account executive stops at ${cap} percent. ${person.approverName ? `${person.approverName} has to approve the rest.` : "You approve the rest."}`;
}

export const substituteLine: Action = async ({ db, person, values }) => {
  const line = await find(db, "line-items.json", values.lineItemId);
  if (!line) refuse("That line was not found.");
  const { account } = await opportunityContext(db, line.opportunityId);
  must(await accountReason(db, person, account));
  const from = await find(db, "products.json", line.productId);
  const to = await find(db, "products.json", values.productId);
  if (!to) refuse("Pick the substitute product.");
  if (to.id === from?.id) refuse("Pick a different product to substitute.");
  if (to.family !== from?.family) refuse(`${to.name} is ${to.family}, not ${from?.family}. A substitute has to be the same family.`);
  const best = await freeForAccount(db, account, String(to.id));
  if (best.free < num(line.quantity)) refuse(`Only ${best.free} ${to.name} free at ${best.warehouseName}.`);
  if (values.buyerAgreed !== "yes") refuse("The buyer has to agree to a substitute.");
  line.substituteFor = String(line.substituteFor || from?.id || "");
  line.productId = String(to.id);
  line.unitPrice = await unitPriceFor(db, account, String(to.id));
  await logActivity(db, { subjectType: "opportunity", subjectId: String(line.opportunityId), accountId: String(account?.id ?? ""), by: person.id, text: `${person.name} substituted ${to.name} for ${from?.name} (buyer agreed).` });
  return { message: `Substituted ${to.name}.` };
};

export const sendQuote: Action = async ({ db, person, values }) => {
  const { opportunity, account } = await opportunityContext(db, values.opportunityId);
  if (opportunity.ownerId !== person.id) refuse("You can send a quote on your own opportunities.");
  const rules = await db.rules();
  must(capReason(opportunity, rules.discountCapPercent, person));
  const lines = await linesOf(db, String(opportunity.id));
  if (lines.length === 0) refuse("Add at least one product before you send the quote.");
  must(await shortLine(db, account, lines));
  const contacts = (await db.rows("contacts.json")).filter((row) => row.accountId === opportunity.accountId);
  const contact = contacts.find((row) => row.id === values.contactId) ?? contacts.find((row) => row.role === "buyer") ?? contacts[0];
  const quotes = await db.rows("quotes.json");
  const earlier = quotes.filter((row) => row.opportunityId === opportunity.id);
  const version = earlier.reduce((max, row) => Math.max(max, num(row.version) || 1), 0) + 1;
  for (const row of earlier) if (row.status === "sent") row.status = "superseded";
  const priceLines: Row[] = [];
  for (const line of lines) priceLines.push({ productId: line.productId, quantity: num(line.quantity), unitPrice: await priced(db, account, line) });
  const id = `quote-${opportunity.id}-v${version}`;
  quotes.push({
    id,
    opportunityId: opportunity.id,
    accountId: opportunity.accountId,
    ownerId: opportunity.ownerId,
    status: "sent",
    version,
    amount: quoteAmount(linesTotal(priceLines), num(opportunity.discountPercent)),
    discountPercent: num(opportunity.discountPercent),
    sentTo: String(contact?.id ?? ""),
    sentAt: new Date().toISOString(),
    validUntil: addDays(today(), rules.quoteValidDays),
    acceptedBy: "",
    buyerPo: "",
    orderId: "",
  });
  const quoteLines = await db.rows("quote-lines.json");
  priceLines.forEach((line, index) => quoteLines.push({ id: `ql-${id}-${index + 1}`, quoteId: id, ...line }));
  await logActivity(db, { subjectType: "opportunity", subjectId: String(opportunity.id), accountId: String(opportunity.accountId), by: person.id, text: `${person.name} sent quote version ${version}${contact ? ` to ${contact.name}` : ""}.` });
  return { id, message: "Quote sent." };
};

async function quoteContext(db: Db, person: Person, quoteId: string) {
  const quote = await find(db, "quotes.json", quoteId);
  if (!quote) refuse("That quote was not found.");
  const account = await find(db, "accounts.json", quote.accountId);
  must(await accountReason(db, person, account));
  return { quote, account };
}

export async function latestVersion(db: Db, opportunityId: unknown) {
  return (await db.rows("quotes.json")).filter((row) => row.opportunityId === opportunityId).reduce((max, row) => Math.max(max, num(row.version) || 1), 0);
}

export const acceptQuote: Action = async ({ db, person, values }) => {
  const { quote } = await quoteContext(db, person, values.quoteId);
  const latest = await latestVersion(db, quote.opportunityId);
  const version = num(quote.version) || 1;
  if (version < latest && (quote.status === "sent" || quote.status === "superseded")) refuse(`Version ${version} was replaced by version ${latest}.`);
  if (quote.status !== "sent") refuse(`This quote is ${quote.status}. Only a sent quote can be accepted.`);
  if (quote.validUntil && String(quote.validUntil) < today()) refuse(`This quote expired on ${prettyDate(quote.validUntil)}. Send a new version.`);
  const contactId = required(values.contactId, "Pick who accepted the quote.");
  const buyerPo = required(values.buyerPo, "Enter the buyer's PO number.");
  quote.status = "accepted";
  quote.acceptedBy = contactId;
  quote.buyerPo = buyerPo;
  await logActivity(db, { subjectType: "opportunity", subjectId: String(quote.opportunityId), accountId: String(quote.accountId), by: person.id, text: `${await db.name(contactId)} accepted quote version ${version} (PO ${buyerPo}).` });
  return { message: "Quote accepted." };
};

export const declineQuote: Action = async ({ db, person, values }) => {
  const { quote } = await quoteContext(db, person, values.quoteId);
  if (quote.status !== "sent") refuse(`This quote is ${quote.status}. Only a sent quote can be declined.`);
  quote.status = "declined";
  quote.declineReason = values.reason ?? "";
  await logActivity(db, { subjectType: "opportunity", subjectId: String(quote.opportunityId), accountId: String(quote.accountId), by: person.id, text: `${person.name} marked quote version ${quote.version || 1} declined${values.reason ? `: ${values.reason}` : "."}` });
  return { message: "Quote declined." };
};

export const convertQuote: Action = async ({ db, person, values }) => {
  const { quote, account } = await quoteContext(db, person, values.quoteId);
  if (quote.status === "converted") refuse(`This quote is already ${quote.orderId}.`);
  if (quote.status !== "accepted") refuse("Mark the quote accepted before you convert it.");
  if (!account) refuse("That restaurant was not found.");
  const amount = num(quote.amount);
  must(await orderBlocker(db, account, amount));
  const rules = await db.rules();
  const dates = deliveryDates(account, rules);
  if (!dates.includes(values.deliveryDate)) refuse(`Pick a delivery date: ${dates.map((day) => prettyDate(day)).join(", ")}.`);
  const quoteLines = (await db.rows("quote-lines.json")).filter((row) => row.quoteId === quote.id);
  if (quoteLines.length === 0) refuse("This quote has no lines to order.");
  const orders = await db.rows("orders.json");
  const id = nextNumberedId("order", orders);
  const lines: Row[] = quoteLines.map((line, index) => ({ id: `ol-${id}-${index + 1}`, orderId: id, productId: line.productId, quantity: num(line.quantity), unitPrice: num(line.unitPrice) }));
  const status = await allocateLines(db, account, lines);
  (await db.rows("order-lines.json")).push(...lines);
  orders.push({ id, accountId: quote.accountId, warehouseId: lines[0].warehouseId, status, amount, quoteId: quote.id, opportunityId: quote.opportunityId, deliveryDate: values.deliveryDate, holdReason: "" });
  quote.status = "converted";
  quote.orderId = id;
  const opportunity = await find(db, "opportunities.json", quote.opportunityId);
  if (opportunity) opportunity.stage = "Closed Won";
  await logActivity(db, { subjectType: "order", subjectId: id, accountId: String(quote.accountId), by: person.id, text: `${person.name} converted quote version ${quote.version || 1} into ${id} (${money(amount)}, ${status}).` });
  return { id, message: status === "backordered" ? `Created ${id}. Some lines are backordered.` : `Created ${id}.` };
};
