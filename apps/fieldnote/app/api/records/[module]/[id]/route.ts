import { NextResponse } from "next/server";
import { readRecords, recordTypes, writeRecords, type Row } from "../../../../../lib/data";

function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function PATCH(request: Request, context: { params: Promise<{ module: string; id: string }> }) {
  const { module: moduleKey, id } = await context.params;
  const type = recordTypes[moduleKey];
  if (!type || type.patchable.length === 0) return fail("That record cannot be changed here.", 404);
  const body = (await request.json()) as { values?: Row };
  const rows = await readRecords(type.file);
  const row = rows.find((candidate) => candidate.id === id);
  if (!row) return fail("Record not found.", 404);

  for (const field of type.patchable) {
    const value = body.values?.[field];
    if (value === undefined || value === null || String(value).trim() === "") continue;
    if (type.numeric.includes(field)) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 0) return fail(`${field} has to be a number.`);
      row[field] = parsed;
    } else {
      row[field] = String(value).trim();
    }
  }
  await writeRecords(type.file, rows);
  return NextResponse.json({ id });
}

export async function DELETE(_request: Request, context: { params: Promise<{ module: string; id: string }> }) {
  const { module: moduleKey, id } = await context.params;
  const type = recordTypes[moduleKey];
  if (!type?.deletable) return fail("That record cannot be deleted here.", 404);
  const rows = await readRecords(type.file);
  const kept = rows.filter((row) => row.id !== id);
  if (kept.length === rows.length) return fail("Record not found.", 404);
  await writeRecords(type.file, kept);
  return NextResponse.json({ id });
}
