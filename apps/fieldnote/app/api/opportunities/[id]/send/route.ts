import { NextResponse } from "next/server";
import { signedInUser } from "../../../../../lib/session";
import { sendQuote } from "../../../../../lib/workflow/actions/quotes";
import { openDb } from "../../../../../lib/workflow/db";
import { Refused } from "../../../../../lib/workflow/refused";

// Send Quote. Answers in plain text, the way the opportunity page and Kiwi already read it.
// The rules live in the send-quote workflow action (owner, cap or approved discount, lines, stock).
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { contactId?: string };
  const db = openDb();
  try {
    const result = await sendQuote({ db, person: await signedInUser(), values: { opportunityId: id, contactId: body.contactId ?? "" } });
    await db.save();
    return new NextResponse(result.message);
  } catch (error) {
    if (error instanceof Refused) {
      const status = /own opportunities/.test(error.message) ? 403 : /not found/i.test(error.message) ? 404 : 400;
      return new NextResponse(error.message, { status });
    }
    throw error;
  }
}
