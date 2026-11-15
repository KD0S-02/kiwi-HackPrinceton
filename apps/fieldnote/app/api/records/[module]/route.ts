import { NextResponse } from "next/server";
import { makeId, nextNumberedId, readRecords, recordTypes, writeRecords, type Row } from "../../../../lib/data";
import { signedInUser } from "../../../../lib/session";
import { requestApproval } from "../../../../lib/workflow/approvals";
import { orderBlocker } from "../../../../lib/workflow/credit";
import { openDb } from "../../../../lib/workflow/db";
import { unitPriceFor } from "../../../../lib/workflow/money";
import { accountFromZip } from "../../../../lib/workflow/actions/onboarding";
import { accountReason, opsCheck } from "../../../../lib/workflow/permissions";
import { Refused } from "../../../../lib/workflow/refused";

function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

// Generic create for the record types in lib/data.ts. Rules that apply to a create (orders on hold,
// new accounts from a ZIP, priced lines, routed approvals) are checked here too.
export async function POST(request: Request, context: { params: Promise<{ module: string }> }) {
  const { module: moduleKey } = await context.params;
  const type = recordTypes[moduleKey];
  if (!type || type.fields.length === 0) return fail("That record type cannot be created here.", 404);
  const body = (await request.json()) as { values?: Row; rows?: Row[] };
  const incoming = body.rows ?? (body.values ? [body.values] : []);
  if (incoming.length === 0) return fail("Nothing to save.");

  const person = await signedInUser();
  if (moduleKey === "approvals") return requestFromOpportunity(incoming[0], person);
  if (moduleKey === "purchase-orders" && opsCheck(person)) return fail(opsCheck(person));
  const db = openDb();
  const existing = await readRecords(type.file);
  const taken = new Set(existing.map((row) => String(row.id)));
  const accounts = await readRecords("accounts.json");
  const created: Row[] = [];

  try {
    for (const raw of incoming) {
      const values: Row = { ...type.defaults };
      for (const field of type.fields) {
        const value = raw[field];
        if (value === undefined || value === null || String(value).trim() === "") continue;
        if (type.numeric.includes(field)) {
          const parsed = Number(value);
          if (!Number.isFinite(parsed)) return fail(`${field} has to be a number.`);
          values[field] = parsed;
        } else {
          values[field] = String(value).trim();
        }
      }
      if (moduleKey === "opportunities" && !values.name) {
        values.name = String(accounts.find((account) => account.id === values.accountId)?.name ?? values.accountId);
      }
      if (moduleKey === "accounts" || moduleKey === "opportunities" || moduleKey === "cases") {
        const chosen = typeof raw.ownerId === "string" ? raw.ownerId.trim() : "";
        if (chosen) values.ownerId = chosen;
        else if (person.book === "own") values.ownerId = person.id;
        else if (moduleKey === "accounts") return fail("Pick the account executive who owns this restaurant.");
        else {
          const account = accounts.find((row) => row.id === values.accountId);
          if (!account?.ownerId) return fail("That restaurant has no owner.");
          values.ownerId = account.ownerId;
        }
      }
      for (const field of type.required) {
        if (values[field] === undefined) return fail(`${field} is required.`);
      }
      if (moduleKey === "accounts") Object.assign(values, await newAccount(db, values));
      if (moduleKey === "cases") Object.assign(values, { subject: values.subject ?? values.kind, openedAt: new Date().toISOString().slice(0, 10), orderId: "", shipmentId: "", invoiceId: "", resolution: "", closedAt: "" });
      if (moduleKey === "purchase-orders") Object.assign(values, { createdBy: person.id, approvalId: "", sentAt: "", expectedDate: "" });
      if (moduleKey === "opportunities") values.amount = Number(values.amount ?? 0);
      if (moduleKey === "activity") {
        values.at = new Date().toISOString();
        values.by = person.id;
      }
      if (moduleKey === "orders") {
        const account = accounts.find((row) => row.id === values.accountId);
        if (!account) return fail("Pick a restaurant.");
        const denied = (await accountReason(db, person, account)) || (await orderBlocker(db, account, Number(values.amount)));
        if (denied) return fail(denied);
        values.warehouseId ??= account.warehouseId;
      }
      if (moduleKey === "line-items") {
        if (Number(values.quantity) < 1) return fail("Quantity has to be at least 1.");
        const opportunity = (await db.rows("opportunities.json")).find((row) => row.id === values.opportunityId);
        const account = accounts.find((row) => row.id === opportunity?.accountId);
        const denied = await accountReason(db, person, account);
        if (denied) return fail(denied);
        values.unitPrice = await unitPriceFor(db, account, String(values.productId));
        values.substituteFor = "";
      }
      const id = moduleKey === "orders" || moduleKey === "cases" ? nextNumberedId(type.prefix, existing) : makeId(type, values, taken);
      taken.add(id);
      const row: Row = { id, ...values };
      existing.push(row);
      created.push(row);
    }
  } catch (error) {
    if (error instanceof Refused) return fail(error.message);
    throw error;
  }

  await writeRecords(type.file, existing);
  return NextResponse.json({ id: created[0].id, count: created.length });
}

// A name and a ZIP finish the account. Buyer and usual order stay optional.
async function newAccount(db: ReturnType<typeof openDb>, values: Row): Promise<Row> {
  return accountFromZip(db, values.zip);
}

// Request approval on an opportunity: the amount is the current discount, and the approver comes from the rule.
async function requestFromOpportunity(raw: Row, person: Awaited<ReturnType<typeof signedInUser>>) {
  const db = openDb();
  const opportunity = (await db.rows("opportunities.json")).find((row) => row.id === raw.opportunityId);
  if (!opportunity) return fail("Opportunity not found.");
  const kind = String(raw.kind ?? "discount") === "pricing exception" ? "pricing exception" : "discount";
  try {
    const denied = await accountReason(db, person, String(opportunity.accountId));
    if (denied) return fail(denied);
    const { approval, message } = await requestApproval(db, person, {
      kind,
      subjectType: "opportunity",
      subjectId: String(opportunity.id),
      opportunityId: String(opportunity.id),
      accountId: String(opportunity.accountId),
      amount: Number(opportunity.discountPercent ?? 0),
      note: String(raw.note ?? ""),
    });
    await db.save();
    return NextResponse.json({ id: approval.id, count: 1, message });
  } catch (error) {
    if (error instanceof Refused) return fail(error.message);
    throw error;
  }
}
