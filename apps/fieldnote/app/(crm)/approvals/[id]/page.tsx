import { notFound } from "next/navigation";
import { ActionButton } from "../../../../components/ActionButton";
import { Pill, RecordLink } from "../../../../components/RecordLink";
import { StatusPath } from "../../../../components/StatusPath";
import { Timeline } from "../../../../components/Timeline";
import { loadNames, money, prettyDate } from "../../../../lib/data";
import { signedInUser } from "../../../../lib/session";
import { activityFor } from "../../../../lib/workflow/activity";
import { ruleSentence, subjectOf, subjectTypeOf } from "../../../../lib/workflow/approvals";
import { find, openDb } from "../../../../lib/workflow/db";
import { decideReason } from "../../../../lib/workflow/permissions";
import { approvalAmount, approvalKind, approvalNumber } from "../../../../lib/workflow/view";

export const dynamic = "force-dynamic";

export default async function ApprovalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = openDb();
  const approval = await find(db, "approvals.json", id);
  if (!approval) notFound();
  const person = await signedInUser();
  const [nameOf, activity, rule] = await Promise.all([loadNames(), db.rows("activity.json"), ruleSentence(db, String(approval.kind))]);
  const blocked = approval.status !== "pending" ? `This request was already ${approval.status}.` : await decideReason(db, person, approval);
  const subjectId = subjectOf(approval);
  const subjectType = subjectTypeOf(approval);
  const memo = subjectType === "credit-memo" ? await find(db, "credit-memos.json", subjectId) : undefined;
  const application = subjectType === "credit-application" ? await find(db, "credit-applications.json", subjectId) : undefined;
  const opportunity = subjectType === "opportunity" ? await find(db, "opportunities.json", subjectId) : undefined;
  const isCreditLimit = approval.kind === "credit limit";

  return (
    <section>
      <div className="page-head">
        <div>
          <div className="crumb"><a href="/approvals">Approvals</a> / {approvalNumber(id)}</div>
          <h1>{approvalKind(approval.kind)} request {approvalNumber(id)}</h1>
          <p>{nameOf(approval.requestedBy)} asked {nameOf(approval.approverId)} · {approval.requestedAt ? prettyDate(approval.requestedAt) : "earlier"}</p>
        </div>
        <div className="actions">
          <ActionButton
            kiwi="approve"
            variant="primary"
            icon="check"
            label="Approve"
            title="Approve request"
            description={rule}
            action="decide-approval"
            hidden={{ approvalId: id, decision: "approved" }}
            submit="Approve"
            blocked={blocked}
            fields={[
              ...(isCreditLimit ? [{ name: "amount", label: "Approved limit", type: "number" as const, value: String(approval.amount ?? ""), hint: "You can approve a lower limit than requested." }] : []),
              { name: "note", label: "Note (optional)", type: "textarea" as const },
            ]}
          />
          <ActionButton
            kiwi="reject"
            variant="soft-danger"
            icon="x"
            label="Reject"
            title="Reject request"
            action="decide-approval"
            hidden={{ approvalId: id, decision: "rejected" }}
            submit="Reject"
            blocked={blocked}
            why="title"
            fields={[{ name: "note", label: "Why", type: "textarea", required: true }]}
          />
        </div>
      </div>

      <StatusPath steps={["pending", "approved"]} current={String(approval.status)} />

      <div className="highlights">
        <div className="highlight"><span>Amount</span><strong>{approvalAmount(approval)}</strong></div>
        <div className="highlight"><span>Restaurant</span><strong>{approval.accountId ? <a href={`/accounts/${approval.accountId}`}>{nameOf(approval.accountId)}</a> : "—"}</strong></div>
        <div className="highlight"><span>For</span><strong><RecordLink id={subjectId} kind={subjectType} /></strong></div>
        <div className="highlight"><span>Status</span><strong><Pill value={approval.status} /></strong></div>
      </div>

      <div className="split">
        <section className="panel">
          <h2>Details</h2>
          <p className="callout">{rule}</p>
          <dl className="facts">
            <dt>Requested by</dt><dd>{nameOf(approval.requestedBy)}</dd>
            <dt>Decides</dt><dd>{nameOf(approval.approverId)}</dd>
            {approval.note ? <><dt>Note</dt><dd>{String(approval.note)}</dd></> : null}
            {opportunity ? <><dt>Discount on the deal</dt><dd>{String(opportunity.discountPercent)}% · {money(opportunity.amount)} forecast</dd></> : null}
            {memo ? <><dt>Credit memo</dt><dd>{String(memo.id).toUpperCase()} · {String(memo.quantity)} {nameOf(memo.productId)} · <RecordLink id={memo.invoiceId} /></dd></> : null}
            {application ? <><dt>Requested limit</dt><dd>{money(application.requestedLimit)}{application.tradeReference ? ` · trade reference ${application.tradeReference}` : ""}</dd></> : null}
            {approval.decidedBy ? <><dt>Decided by</dt><dd>{nameOf(approval.decidedBy)} · {prettyDate(approval.decidedAt)}</dd></> : null}
            {approval.decisionNote ? <><dt>Decision note</dt><dd>{String(approval.decisionNote)}</dd></> : null}
          </dl>
        </section>
        <section className="panel">
          <h2 style={{ marginBottom: 12 }}>Activity</h2>
          <Timeline entries={activityFor(activity, "approval", id)} nameOf={nameOf} empty="No activity on this request." />
        </section>
      </div>
    </section>
  );
}
