import { NextResponse } from "next/server";
import { readRecords, readRules, writeRecords } from "../../../../../lib/data";
import { signedInUser } from "../../../../../lib/session";
import { openDb } from "../../../../../lib/workflow/db";
import { accountReason } from "../../../../../lib/workflow/permissions";

// The one place the discount changes. Saving over the cap is allowed; sending is what the cap stops.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json();
  const discountPercent = Number(body.discountPercent);
  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
    return new NextResponse("Discount has to be a number from 0 to 100.", { status: 400 });
  }
  const opportunities = await readRecords("opportunities.json");
  const opportunity = opportunities.find((row) => row.id === id);
  if (!opportunity) return new NextResponse("Opportunity not found.", { status: 404 });
  const denied = await accountReason(openDb(), await signedInUser(), String(opportunity.accountId));
  if (denied) return new NextResponse(denied, { status: 403 });
  opportunity.discountPercent = discountPercent;
  await writeRecords("opportunities.json", opportunities);
  const cap = (await readRules()).discountCapPercent;
  return new NextResponse(discountPercent > cap ? `Saved ${discountPercent}. Still over the ${cap}% cap.` : `Saved discount ${discountPercent}.`);
}
