import { NextResponse } from "next/server";
import { readRecords, recordTypes, writeRecords, type Row } from "../../../../../lib/data";
import { signedInUser } from "../../../../../lib/session";
import { openDb } from "../../../../../lib/workflow/db";
import { accountReason, opsCheck } from "../../../../../lib/workflow/permissions";

function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

// Generic edit. Only the fields in recordTypes[module].patchable can change; status, money and
// stock fields are not there, so they only move through workflow actions.
export async function PATCH(request: Request, context: { params: Promise<{ module: string; id: string }> }) {
  const { module: moduleKey, id } = await context.params;
  const type = recordTypes[moduleKey];
  if (!type || type.patchable.length === 0) return fail("That record cannot be changed here.", 404);
  const body = (await request.json()) as { values?: Row };
  const rows = await readRecords(type.file);
  const row = rows.find((candidate) => candidate.id === id);
  if (!row) return fail("Record not found.", 404);

  const next: Row = { ...row };
  for (const field of type.patchable) {
    const value = body.values?.[field];
    if (value === undefined || value === null || String(value).trim() === "") continue;
    if (type.numeric.includes(field)) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 0) return fail(`${field} has to be a number.`);
      next[field] = parsed;
    } else {
      next[field] = String(value).trim();
    }
  }
  if (moduleKey === "accounts") {
    const problem = await warehouseProblem(next);
    if (problem) return fail(problem);
  }
  Object.assign(row, next);
  await writeRecords(type.file, rows);
  return NextResponse.json({ id });
}

// A restaurant is served from a warehouse in its territory's office.
async function warehouseProblem(account: Row) {
  if (!account.territoryId || !account.warehouseId) return "";
  const [territories, warehouses] = await Promise.all([readRecords("territories.json"), readRecords("warehouses.json")]);
  const territory = territories.find((row) => row.id === account.territoryId);
  const warehouse = warehouses.find((row) => row.id === account.warehouseId);
  if (!territory || !warehouse) return "";
  return warehouse.officeId === territory.officeId ? "" : `${warehouse.name} does not serve the ${territory.name}.`;
}

// Child rows that go with their parent.
const children: Record<string, { file: string; key: string }> = {
  orders: { file: "order-lines.json", key: "orderId" },
  "purchase-orders": { file: "purchase-order-lines.json", key: "poId" },
};

export async function DELETE(_request: Request, context: { params: Promise<{ module: string; id: string }> }) {
  const { module: moduleKey, id } = await context.params;
  const type = recordTypes[moduleKey];
  if (!type?.deletable) return fail("That record cannot be deleted here.", 404);
  const rows = await readRecords(type.file);
  const target = rows.find((row) => row.id === id);
  if (!target) return fail("Record not found.", 404);
  const person = await signedInUser();
  const denied = moduleKey === "purchase-orders"
    ? opsCheck(person)
    : await accountReason(openDb(), person, moduleKey === "accounts" ? target : String(target.accountId ?? (await readRecords("opportunities.json")).find((row) => row.id === target.opportunityId)?.accountId ?? ""));
  if (denied && moduleKey !== "contacts" && moduleKey !== "activity") return fail(denied, 403);
  const kept = rows.filter((row) => row.id !== id);
  await writeRecords(type.file, kept);
  const child = children[moduleKey];
  if (child) {
    const lines = await readRecords(child.file);
    const remaining = lines.filter((line) => line[child.key] !== id);
    if (remaining.length !== lines.length) await writeRecords(child.file, remaining);
  }
  return NextResponse.json({ id });
}
