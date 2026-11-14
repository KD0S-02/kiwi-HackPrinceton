import { nextNumberedId, today, type Row } from "../../data";
import { logActivity } from "../activity";
import { requestApproval } from "../approvals";
import { find, num, type Db } from "../db";
import { accountReason } from "../permissions";
import { must, refuse } from "../refused";
import { dollars, required, type Action } from "./types";

// Workflow 5: a new restaurant works through a checklist before it can order.

export async function territoryForZip(db: Db, zip: unknown) {
  const prefix = String(zip ?? "").trim().slice(0, 2);
  if (!/^\d{2}$/.test(prefix)) return undefined;
  return (await db.rows("territories.json")).find((row) => String(row.zipPrefixes ?? "").split("|").includes(prefix));
}

// The first warehouse in the territory's office takes new accounts.
export async function defaultWarehouse(db: Db, territory: Row | undefined) {
  return (await db.rows("warehouses.json")).find((row) => territory && row.officeId === territory.officeId);
}

export async function apContact(db: Db, accountId: unknown) {
  return (await db.rows("contacts.json")).find((row) => row.accountId === accountId && row.role === "accounts payable" && String(row.email ?? "").includes("@"));
}

export type ChecklistItem = { key: string; label: string; done: boolean; detail: string };

export async function checklist(db: Db, account: Row): Promise<ChecklistItem[]> {
  const contacts = (await db.rows("contacts.json")).filter((row) => row.accountId === account.id);
  const buyer = contacts.find((row) => row.role === "buyer");
  const ap = await apContact(db, account.id);
  const exemptOk = account.taxStatus === "exempt" && !!account.taxCertificate && String(account.taxExpires ?? "") > today();
  return [
    { key: "buyer", label: "Buyer contact", done: !!buyer, detail: buyer ? String(buyer.name) : "Who places the orders." },
    { key: "ap", label: "Accounts payable contact with an email", done: !!ap, detail: ap ? `${ap.name} · ${ap.email}` : "Who gets the invoices." },
    { key: "territory", label: "Territory and warehouse confirmed", done: account.territoryConfirmed === "yes", detail: account.territoryConfirmed === "yes" ? `${await db.name(account.territoryId)} · ${await db.name(account.warehouseId)}` : `From ZIP ${account.zip || "—"}.` },
    { key: "price-book", label: "Price book", done: !!account.priceBookId, detail: account.priceBookId ? await db.name(account.priceBookId) : "Northeast accounts use the Northeast book." },
    { key: "delivery-days", label: "Delivery days", done: !!account.deliveryDays, detail: account.deliveryDays ? String(account.deliveryDays).split("|").join(", ") : "Limited to the territory's truck days." },
    { key: "tax", label: "Tax status", done: account.taxStatus === "taxable" || exemptOk, detail: account.taxStatus ? String(account.taxStatus) + (account.taxStatus === "exempt" ? ` · ${account.taxCertificate || "no certificate"}` : "") : "Taxable, or exempt with a certificate." },
    { key: "credit", label: "Credit approved", done: account.creditStatus === "approved" && num(account.creditLimit) > 0, detail: account.creditStatus === "approved" ? `Limit $${num(account.creditLimit).toLocaleString()}` : account.creditStatus === "applied" ? "Waiting on finance." : "Apply once the AP contact is on file." },
  ];
}

async function accountFor(db: Db, values: Record<string, string>) {
  const account = await find(db, "accounts.json", values.accountId);
  if (!account) refuse("That restaurant was not found.");
  return account;
}

async function logStep(db: Db, account: Row, personId: string, line: string) {
  await logActivity(db, { subjectType: "account", subjectId: String(account.id), accountId: String(account.id), by: personId, text: line });
}

export const confirmTerritory: Action = async ({ db, person, values }) => {
  const account = await accountFor(db, values);
  must(await accountReason(db, person, account));
  const territory = await territoryForZip(db, account.zip);
  if (!territory) refuse(`No territory covers ZIP ${account.zip || "(none)"}. Ask your manager.`);
  const warehouse = await defaultWarehouse(db, territory);
  account.territoryId = String(territory.id);
  account.warehouseId = String(warehouse?.id ?? "");
  account.territoryConfirmed = "yes";
  await logStep(db, account, person.id, `${person.name} confirmed ${territory.name} and ${warehouse?.name ?? "no warehouse"} for ${account.name}.`);
  return { message: `${territory.name} · ${warehouse?.name ?? "no warehouse"}.` };
};

export const setPriceBook: Action = async ({ db, person, values }) => {
  const account = await accountFor(db, values);
  must(await accountReason(db, person, account));
  if (!account.territoryId) refuse("Confirm the territory first.");
  const book = required(values.priceBookId, "Pick a price book.");
  const northeast = account.territoryId === "northeast";
  if (northeast && book !== "northeast") refuse(`${account.name} is in the Northeast, so it uses the Northeast price book.`);
  if (!northeast && book !== "standard") refuse("Only Northeast accounts use the Northeast price book. Use Standard.");
  account.priceBookId = book;
  await logStep(db, account, person.id, `${person.name} set ${account.name} to the ${await db.name(book)} price book.`);
  return { message: "Price book set." };
};

export const setDeliveryDays: Action = async ({ db, person, values }) => {
  const account = await accountFor(db, values);
  must(await accountReason(db, person, account));
  if (!account.territoryId) refuse("Confirm the territory first.");
  const rules = await db.rules();
  const allowed = String(rules.deliveryDays[String(account.territoryId)] ?? "").split("|").filter(Boolean);
  const picked = String(values.deliveryDays ?? "").split(/[|,\s]+/).map((day) => day.trim()).filter(Boolean).map((day) => day.slice(0, 1).toUpperCase() + day.slice(1, 3).toLowerCase());
  if (picked.length === 0) refuse("Pick at least one delivery day.");
  const wrong = picked.find((day) => !allowed.includes(day));
  if (wrong) refuse(`${await db.name(account.territoryId)} trucks run on ${allowed.join(" and ")} only. ${wrong} is not one of them.`);
  account.deliveryDays = [...new Set(picked)].join("|");
  await logStep(db, account, person.id, `${person.name} set delivery days to ${picked.join(", ")}.`);
  return { message: "Delivery days set." };
};

export const setTax: Action = async ({ db, person, values }) => {
  const account = await accountFor(db, values);
  must(await accountReason(db, person, account));
  const status = required(values.taxStatus, "Pick taxable or exempt.");
  if (status !== "taxable" && status !== "exempt") refuse("Pick taxable or exempt.");
  if (status === "exempt") {
    if (!values.taxCertificate?.trim() || !values.taxExpires?.trim()) refuse("Exempt accounts need a certificate number and an expiry date.");
    if (values.taxExpires <= today()) refuse("That certificate has expired. Exempt needs an expiry date in the future.");
  }
  account.taxStatus = status;
  account.taxCertificate = status === "exempt" ? values.taxCertificate.trim() : "";
  account.taxExpires = status === "exempt" ? values.taxExpires.trim() : "";
  await logStep(db, account, person.id, `${person.name} set tax status to ${status}.`);
  return { message: "Tax status set." };
};

export const applyCredit: Action = async ({ db, person, values }) => {
  const account = await accountFor(db, values);
  must(await accountReason(db, person, account));
  if (!(await apContact(db, account.id))) refuse("Add an accounts payable contact with an email first.");
  const applications = await db.rows("credit-applications.json");
  if (applications.some((row) => row.accountId === account.id && row.status === "pending approval")) refuse(`A credit application for ${account.name} is already waiting on finance.`);
  const requested = dollars(values.requestedLimit, "Enter the credit limit you are asking for.");
  const rules = await db.rules();
  const id = nextNumberedId("credit-app", applications);
  const application: Row = { id, accountId: account.id, requestedLimit: requested, tradeReference: values.tradeReference ?? "", status: "pending approval", approvedLimit: 0, approvalId: "", by: person.id, at: new Date().toISOString() };
  applications.push(application);
  if (requested <= rules.autoCreditLimitDollars) {
    application.status = "approved";
    application.approvedLimit = requested;
    account.creditLimit = requested;
    account.creditStatus = "approved";
    account.paymentTerms = "net 30";
    await logStep(db, account, person.id, `${account.name} was approved for a $${requested.toLocaleString()} credit limit.`);
    return { id, message: `Approved for $${requested.toLocaleString()}.` };
  }
  account.creditStatus = "applied";
  const { approval, message } = await requestApproval(db, person, { kind: "credit limit", subjectType: "credit-application", subjectId: id, accountId: String(account.id), amount: requested, note: values.tradeReference ? `Trade reference: ${values.tradeReference}` : "" });
  application.approvalId = String(approval.id);
  return { id, message };
};

export const activateAccount: Action = async ({ db, person, values }) => {
  const account = await accountFor(db, values);
  must(await accountReason(db, person, account));
  if (account.status === "active") refuse(`${account.name} is already active.`);
  const open = (await checklist(db, account)).find((item) => !item.done);
  if (open) refuse(`Finish the checklist first: ${open.label.toLowerCase()}.`);
  account.status = "active";
  await logStep(db, account, person.id, `${person.name} activated ${account.name}.`);
  return { message: `${account.name} is active and can order.` };
};
