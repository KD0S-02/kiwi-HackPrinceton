import { NextResponse } from "next/server";
import { readRecords, readRules, writeRecords } from "../../../../../lib/data";
import { signedInUser } from "../../../../../lib/session";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const rules = await readRules();
  const opportunities = await readRecords("opportunities.json");
  const opportunity = opportunities.find((row) => row.id === id);
  if (!opportunity) return new NextResponse("Opportunity not found.", { status: 404 });
  const person = await signedInUser();
  if (opportunity.ownerId !== person.id) {
    return new NextResponse("You can send a quote on your own opportunities.", { status: 403 });
  }
  if (Number(opportunity.discountPercent) > rules.discountCapPercent) {
    return new NextResponse(
      `An account executive stops at ${rules.discountCapPercent} percent. ${person.approverName ? `${person.approverName} has to approve the rest.` : "You approve the rest."}`,
      { status: 400 },
    );
  }
  const quotes = await readRecords("quotes.json");
  quotes.push({
    id: `quote-${opportunity.id}`,
    opportunityId: opportunity.id,
    accountId: opportunity.accountId,
    ownerId: opportunity.ownerId,
    status: "sent",
    amount: opportunity.amount,
  });
  await writeRecords("quotes.json", quotes);
  return new NextResponse("Quote sent.");
}
