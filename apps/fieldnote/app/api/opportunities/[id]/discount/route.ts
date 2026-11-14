import { NextResponse } from "next/server";
import { readRecords, writeRecords } from "../../../../../lib/data";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json();
  const discountPercent = Number(body.discountPercent);
  if (!Number.isFinite(discountPercent)) {
    return new NextResponse("Discount has to be a number.", { status: 400 });
  }
  const opportunities = await readRecords("opportunities.json");
  const opportunity = opportunities.find((row) => row.id === id);
  if (!opportunity) return new NextResponse("Opportunity not found.", { status: 404 });
  opportunity.discountPercent = discountPercent;
  await writeRecords("opportunities.json", opportunities);
  return new NextResponse(`Saved discount ${discountPercent}.`);
}
