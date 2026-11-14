import { NextResponse } from "next/server";
import { makeId, readRecords, recordTypes, writeRecords, type Row } from "../../../../lib/data";

function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request, context: { params: Promise<{ module: string }> }) {
  const { module: moduleKey } = await context.params;
  const type = recordTypes[moduleKey];
  if (!type || type.fields.length === 0) return fail("That record type cannot be created here.", 404);
  const body = (await request.json()) as { values?: Row; rows?: Row[] };
  const incoming = body.rows ?? (body.values ? [body.values] : []);
  if (incoming.length === 0) return fail("Nothing to save.");

  const existing = await readRecords(type.file);
  const taken = new Set(existing.map((row) => String(row.id)));
  const accounts = moduleKey === "opportunities" ? await readRecords("accounts.json") : [];
  const created: Row[] = [];

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
    for (const field of type.required) {
      if (values[field] === undefined) return fail(`${field} is required.`);
    }
    if (moduleKey === "opportunities") values.amount = Number(values.amount ?? 0);
    if (moduleKey === "activity") values.at = new Date().toISOString();
    const id = makeId(type, values, taken);
    taken.add(id);
    const row: Row = { id, ...values };
    existing.push(row);
    created.push(row);
  }

  await writeRecords(type.file, existing);
  return NextResponse.json({ id: created[0].id, count: created.length });
}
