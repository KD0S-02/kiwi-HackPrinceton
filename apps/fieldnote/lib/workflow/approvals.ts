import { money, nextNumberedId, round2, type Row } from "../data";
import type { Person } from "../people";
import { logActivity } from "./activity";
import { clearHold, releaseBlocker } from "./credit";
import { find, num, text, type Db } from "./db";
import { invoiceBalance } from "./money";
import { decideReason } from "./permissions";
import { must, refuse } from "./refused";

export type ApprovalKind = "discount" | "pricing exception" | "credit" | "payment plan" | "purchase order" | "credit limit" | "hold release";

const financeKinds: ApprovalKind[] = ["payment plan", "purchase order", "credit limit", "hold release"];

// The rule sentence shown on each approval, so the approver sees why it came to them.
export async function ruleSentence(db: Db, kind: string) {
  const rules = await db.rules();
  switch (kind) {
    case "discount": return `Discounts over ${rules.discountCapPercent} percent need the approver.`;
    case "pricing exception": return "Pricing exceptions need the approver.";
    case "credit": return `Credits over ${money(rules.creditApprovalOverDollars)} need the approver.`;
    case "payment plan": return `Plans over ${money(rules.paymentPlanApprovalOverDollars)} or longer than ${rules.paymentPlanMaxInstallmentsWithoutApproval} installments go to finance.`;
    case "purchase order": return `Purchase orders over ${money(rules.purchaseOrderApprovalOverDollars)} go to finance.`;
    case "credit limit": return `Credit limits over ${money(rules.autoCreditLimitDollars)} go to finance.`;
    case "hold release": return "Finance releases credit holds.";
    default: return "";
  }
}

// Discounts, pricing exceptions and credits go to the requester's approver. Finance kinds go to
// the finance approver. "" means nobody is above the requester, so they approve it themselves.
export async function approverFor(db: Db, person: Person, kind: string) {
  const rules = await db.rules();
  const approver = financeKinds.includes(kind as ApprovalKind) ? rules.financeApproverId : person.approverId;
  return approver && approver !== person.id ? approver : "";
}

export type ApprovalRequest = {
  kind: ApprovalKind;
  subjectType: string;
  subjectId: string;
  accountId: string;
  amount: number;
  note?: string;
  opportunityId?: string;
};

export async function pendingApproval(db: Db, kind: string, subjectId: string) {
  return (await db.rows("approvals.json")).find((row) => row.kind === kind && subjectOf(row) === subjectId && row.status === "pending");
}

export function subjectOf(approval: Row) {
  return String(approval.subjectId || approval.opportunityId || "");
}

export function subjectTypeOf(approval: Row) {
  return String(approval.subjectType || (approval.opportunityId ? "opportunity" : ""));
}

// Creates the request. When the requester has nobody above them, it is approved on the spot and
// its effect runs at once.
export async function requestApproval(db: Db, person: Person, request: ApprovalRequest) {
  const waiting = await pendingApproval(db, request.kind, request.subjectId);
  if (waiting) refuse(`That request is already waiting on ${await db.name(waiting.approverId)}.`);
  const approvals = await db.rows("approvals.json");
  const approverId = await approverFor(db, person, request.kind);
  const now = new Date().toISOString();
  const approval: Row = {
    id: nextNumberedId("approval", approvals),
    kind: request.kind,
    subjectType: request.subjectType,
    subjectId: request.subjectId,
    accountId: request.accountId,
    amount: request.amount,
    note: request.note ?? "",
    requestedBy: person.id,
    requestedAt: now,
    approverId: approverId || person.id,
    status: approverId ? "pending" : "approved",
    decidedBy: approverId ? "" : person.id,
    decidedAt: approverId ? "" : now,
    decisionNote: approverId ? "" : "Approved by the requester, who has no approver.",
  };
  if (request.opportunityId) approval.opportunityId = request.opportunityId;
  approvals.push(approval);
  const what = `${request.kind} request for ${await subjectLabel(db, approval)}`;
  if (!approverId) {
    await runEffect(db, approval, "approved", person);
    await logDecision(db, approval, person, `${person.name} approved a ${what} themselves.`);
    return { approval, self: true, message: "You approve this yourself." };
  }
  const approverName = await db.name(approverId);
  await logDecision(db, approval, person, `${person.name} sent a ${what} to ${approverName}.`);
  return { approval, self: false, message: `Sent to ${approverName} for approval.` };
}

export async function decideApproval(db: Db, person: Person, approvalId: string, decision: string, note = "", amount?: number) {
  const approval = await find(db, "approvals.json", approvalId);
  if (!approval) refuse("That request was not found.");
  if (decision !== "approved" && decision !== "rejected") refuse("Pick approve or reject.");
  must(await decideReason(db, person, approval));
  if (approval.status !== "pending") refuse(`This request was already ${approval.status}.`);
  approval.status = decision;
  approval.decidedBy = person.id;
  approval.decidedAt = new Date().toISOString();
  approval.decisionNote = note;
  await runEffect(db, approval, decision, person, amount);
  const verb = decision === "approved" ? "approved" : "rejected";
  await logDecision(db, approval, person, `${person.name} ${verb} the ${approval.kind} request for ${await subjectLabel(db, approval)}${note ? `: ${note}` : "."}`);
  return decision === "approved" ? "Approved." : "Rejected.";
}

async function logDecision(db: Db, approval: Row, person: Person, line: string) {
  const subjectType = subjectTypeOf(approval);
  const subjectId = subjectOf(approval);
  // The subject's line carries accountId, so the account timeline shows it too.
  await logActivity(db, { subjectType, subjectId, accountId: text(approval.accountId), by: person.id, text: line });
  await logActivity(db, { subjectType: "approval", subjectId: String(approval.id), by: person.id, text: line });
}

export async function subjectLabel(db: Db, approval: Row) {
  const type = subjectTypeOf(approval);
  const id = subjectOf(approval);
  if (type === "opportunity" || type === "account") return db.name(type === "opportunity" ? (await find(db, "opportunities.json", id))?.accountId ?? id : id);
  return `${/^cm-\d+$/.test(id) ? id.toUpperCase() : id} (${await db.name(approval.accountId)})`;
}

// What approving (or rejecting) a request changes.
async function runEffect(db: Db, approval: Row, decision: string, person: Person, amount?: number) {
  const approved = decision === "approved";
  const subjectId = subjectOf(approval);
  switch (approval.kind) {
    case "discount": {
      const opportunity = await find(db, "opportunities.json", subjectId);
      if (opportunity && approved) opportunity.approvedDiscountPercent = num(approval.amount ?? opportunity.discountPercent);
      return;
    }
    case "credit": {
      const memo = await find(db, "credit-memos.json", subjectId);
      if (!memo) return;
      if (!approved) {
        memo.status = "rejected";
        return;
      }
      await postCreditMemo(db, memo);
      return;
    }
    case "payment plan": {
      const plan = await find(db, "payment-plans.json", subjectId);
      if (plan) plan.status = approved ? "active" : "rejected";
      return;
    }
    case "purchase order": {
      const po = await find(db, "purchase-orders.json", subjectId);
      if (po) po.status = approved ? "approved" : "draft";
      return;
    }
    case "credit limit": {
      const application = await find(db, "credit-applications.json", subjectId);
      const account = await find(db, "accounts.json", application?.accountId ?? approval.accountId);
      if (!application || !account) return;
      if (!approved) {
        application.status = "declined";
        account.creditStatus = "declined";
        return;
      }
      const requested = num(application.requestedLimit);
      const limit = amount && amount > 0 ? amount : requested;
      if (limit > requested) refuse(`The approved limit cannot be more than the ${money(requested)} requested.`);
      application.status = "approved";
      application.approvedLimit = limit;
      account.creditLimit = limit;
      account.creditStatus = "approved";
      account.paymentTerms = "net 30";
      approval.amount = limit;
      return;
    }
    case "hold release": {
      const account = await find(db, "accounts.json", subjectId);
      if (!account || !approved) return;
      must(await releaseBlocker(db, account));
      await clearHold(db, account, person);
      return;
    }
    default:
      return;
  }
}

// Posting a memo takes it off the invoice balance and marks the shipment line credited.
export async function postCreditMemo(db: Db, memo: Row) {
  const invoice = await find(db, "invoices.json", memo.invoiceId);
  const line = await find(db, "shipment-lines.json", memo.shipmentLineId);
  memo.status = "posted";
  if (invoice) {
    invoice.credited = round2(num(invoice.credited) + num(memo.amount));
    if (invoiceBalance(invoice) <= 0) invoice.status = "paid";
  }
  if (line) line.credited = num(line.credited) + num(memo.quantity);
}
