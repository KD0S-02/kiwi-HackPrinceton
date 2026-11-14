import { NextResponse } from "next/server";
import { signedInUser } from "../../../../lib/session";
import { actions } from "../../../../lib/workflow/actions";
import type { Values } from "../../../../lib/workflow/actions/types";
import { openDb } from "../../../../lib/workflow/db";
import { Refused } from "../../../../lib/workflow/refused";

// One endpoint for every workflow step. The body is { values } (what ActionButton sends).
// A refusal is HTTP 400 { error: "<one plain sentence>" } and changes no file.
export async function POST(request: Request, context: { params: Promise<{ name: string }> }) {
  const { name } = await context.params;
  const action = actions[name];
  if (!action) return NextResponse.json({ error: `There is no action called ${name}.` }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { values?: Record<string, unknown> };
  const values: Values = Object.fromEntries(Object.entries(body.values ?? {}).map(([key, value]) => [key, value == null ? "" : String(value)]));
  const person = await signedInUser();
  const db = openDb();
  try {
    const result = await action({ db, person, values });
    await db.save();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof Refused) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error(`action ${name} failed`, error);
    return NextResponse.json({ error: "Something went wrong. Nothing was saved." }, { status: 500 });
  }
}
