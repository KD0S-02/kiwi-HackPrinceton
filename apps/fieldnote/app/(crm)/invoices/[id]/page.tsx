import { notFound } from "next/navigation";
import { ActionButton } from "../../../../components/ActionButton";
import { Pill, RecordLink } from "../../../../components/RecordLink";
import { StatusPath } from "../../../../components/StatusPath";
import { Timeline } from "../../../../components/Timeline";
import { addDays, loadNames, money, prettyDate, today } from "../../../../lib/data";
import { signedInUser } from "../../../../lib/session";
import { activityFor } from "../../../../lib/workflow/activity";
import { preflight } from "../../../../lib/workflow/actions";
import { callOutcomes, openShort } from "../../../../lib/workflow/actions/cases";
import { livePlan } from "../../../../lib/workflow/actions/credit";
import { find, num, openDb } from "../../../../lib/workflow/db";
import { daysPastDue, invoiceBalance, isPastDue, paidOn, planSchedule } from "../../../../lib/workflow/money";

export const dynamic = "force-dynamic";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = openDb();
  const invoice = await find(db, "invoices.json", id);
  if (!invoice) notFound();
  const person = await signedInUser();
  const [nameOf, activity, memos, payments, plans, shipments, shipmentLines, rules] = await Promise.all([
    loadNames(), db.rows("activity.json"), db.rows("credit-memos.json"), db.rows("payments.json"), db.rows("payment-plans.json"), db.rows("shipments.json"), db.rows("shipment-lines.json"), db.rules(),
  ]);
  const balance = invoiceBalance(invoice);
  const late = daysPastDue(invoice);
  const pastDue = isPastDue(invoice, rules);
  const invoiceMemos = memos.filter((row) => row.invoiceId === id);
  const invoicePayments = payments.filter((row) => row.invoiceId === id);
  const plan = (await livePlan(db, id)) ?? plans.filter((row) => row.invoiceId === id).at(-1);
  const schedule = plan ? planSchedule(plan, await paidOn(db, id)) : [];
  const shipmentIds = shipments.filter((row) => row.orderId === invoice.orderId).map((row) => String(row.id));
  const shortLines = (await Promise.all(shipmentLines.filter((line) => shipmentIds.includes(String(line.shipmentId)) && num(line.short) > 0).map(async (line) => ({ line, open: await openShort(db, line) }))));
  const creditTarget = shortLines.find((item) => item.open > 0);
  const waitingMemo = memos.find((row) => row.invoiceId === id && row.status === "pending approval");
  const creditBlocked = creditTarget
    ? await preflight("issue-credit", person, { invoiceId: id, shipmentLineId: String(creditTarget.line.id), quantity: String(creditTarget.open), reason: "short delivery" })
    : shortLines.length === 0
      ? "Nothing on this invoice was reported short."
      : waitingMemo
        ? `${String(waitingMemo.id).toUpperCase()} is waiting on approval. Every other short line has a redelivery or a credit.`
        : "Every short line already has a redelivery or a credit.";
  const firstDate = addDays(today(), 7);
  const planBlocked = await preflight("propose-plan", person, { invoiceId: id, installments: "4", firstDate });
  const paymentBlocked = await preflight("record-payment", person, { invoiceId: id, amount: String(Math.min(balance, 1) || 1), method: "check", reference: "check" });
  const callBlocked = await preflight("log-call", person, { subjectType: "invoice", subjectId: id, outcome: "no answer", text: "check" });
  const steps = ["open", "paid"];

  return (
    <section>
      <div className="page-head">
        <div>
          <div className="crumb"><a href="/orders">Fulfillment</a> / <a href="/invoices">Invoices</a> / {id}</div>
          <h1>Invoice to {nameOf(invoice.accountId)}</h1>
          <p>{id} · order <RecordLink id={invoice.orderId} /> · issued {prettyDate(invoice.issuedAt)} · due {prettyDate(invoice.dueDate)}</p>
        </div>
        <div className="actions">
          <ActionButton
            kiwi="log-call"
            icon="phone"
            label="Log call"
            title={`Collections call with ${nameOf(invoice.accountId)}`}
            action="log-call"
            hidden={{ subjectType: "invoice", subjectId: id }}
            blocked={callBlocked}
            why="title"
            fields={[
              { name: "outcome", label: "How it went", type: "select", options: callOutcomes.map((value) => ({ value, label: value })) },
              { name: "text", label: "Note", type: "textarea", required: true, placeholder: "Owner promised a check Friday." },
            ]}
          />
          <ActionButton
            kiwi="issue-credit"
            icon="dollar"
            label="Issue credit"
            title="Issue a credit for a short line"
            description={`Credits over ${money(rules.creditApprovalOverDollars)} go to ${person.approverName || "you"} for approval.`}
            action="issue-credit"
            hidden={{ invoiceId: id }}
            submit="Issue credit"
            blocked={creditBlocked}
            fields={[
              { name: "shipmentLineId", label: "Short line", type: "select", value: String(creditTarget?.line.id ?? ""), options: shortLines.map(({ line, open }) => ({ value: String(line.id), label: `${nameOf(line.productId)} · ${open} open of ${num(line.short)} short` })) },
              { name: "quantity", label: "Quantity to credit", type: "number", required: true, value: String(creditTarget?.open || 1), min: 1 },
              { name: "reason", label: "Reason", value: "short delivery" },
            ]}
          />
          <ActionButton
            kiwi="propose-plan"
            icon="clipboard"
            label="Propose plan"
            title="Propose a payment plan"
            description={`Plans over ${money(rules.paymentPlanApprovalOverDollars)} or longer than ${rules.paymentPlanMaxInstallmentsWithoutApproval} installments go to finance.`}
            action="propose-plan"
            hidden={{ invoiceId: id }}
            submit="Propose plan"
            blocked={planBlocked}
            fields={[
              { name: "installments", label: "Installments", type: "select", value: "4", options: ["2", "3", "4", "5", "6"].map((value) => ({ value, label: `${value} payments every 14 days` })) },
              { name: "firstDate", label: "First payment", type: "date", value: firstDate, required: true, hint: "Within the next 30 days." },
            ]}
          />
          <ActionButton
            kiwi="record-payment"
            variant="primary"
            icon="dollar"
            label="Record payment"
            title="Record a payment"
            action="record-payment"
            hidden={{ invoiceId: id }}
            submit="Record payment"
            blocked={paymentBlocked}
            fields={[
              { name: "amount", label: "Amount", type: "number", required: true, value: String(schedule.find((item) => !item.paid)?.amount ?? balance) },
              { name: "method", label: "Method", type: "select", options: ["check", "ACH", "card"].map((value) => ({ value, label: value })) },
              { name: "reference", label: "Reference", placeholder: "Check 1042" },
            ]}
          />
        </div>
      </div>

      <StatusPath steps={steps} current={String(invoice.status)} />

      <div className="highlights five">
        <div className="highlight"><span>Amount</span><strong>{money(invoice.amount)}</strong></div>
        <div className="highlight"><span>Paid</span><strong>{money(invoice.paid)}</strong></div>
        <div className="highlight"><span>Credited</span><strong>{money(invoice.credited)}</strong></div>
        <div className={`highlight${balance > 0 && pastDue ? " alert" : ""}`}><span>Balance</span><strong id="balance">{money(balance)}</strong></div>
        <div className={`highlight${pastDue ? " alert" : ""}`}><span>Due</span><strong>{prettyDate(invoice.dueDate)}</strong><small className="sub">{balance <= 0 ? "settled" : late > 0 ? `${late} days past due${pastDue ? " · on hold rule" : ""}` : "current"}</small></div>
      </div>

      <div className="split">
        <section className="panel">
          <div className="panel-head"><h2>Credit memos</h2><a href="/credit-memos">All memos →</a></div>
          {invoiceMemos.length === 0 ? <p className="empty">No credits on this invoice.</p> : (
            <table>
              <thead><tr><th>Memo</th><th>Line</th><th className="num">Qty</th><th className="num">Amount</th><th>Status</th></tr></thead>
              <tbody>
                {invoiceMemos.map((memo) => (
                  <tr key={String(memo.id)}>
                    <td>{String(memo.id).toUpperCase()}</td>
                    <td>{nameOf(memo.productId)}</td>
                    <td className="num">{num(memo.quantity)}</td>
                    <td className="num">{money(memo.amount)}</td>
                    <td><Pill value={memo.status} />{memo.approvalId && memo.status === "pending approval" ? <> <a href={`/approvals/${memo.approvalId}`}>request →</a></> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="panel-head" style={{ marginTop: 20 }}><h2>Payments</h2><a href="/payments">All payments →</a></div>
          {invoicePayments.length === 0 ? <p className="empty">No payments yet.</p> : (
            <table>
              <thead><tr><th>Payment</th><th>Method</th><th>Reference</th><th className="num">Amount</th><th>Recorded</th></tr></thead>
              <tbody>
                {invoicePayments.map((payment) => (
                  <tr key={String(payment.id)}>
                    <td>{String(payment.id)}</td>
                    <td>{String(payment.method)}</td>
                    <td>{String(payment.reference || "—")}</td>
                    <td className="num">{money(payment.amount)}</td>
                    <td>{nameOf(payment.by)} · {prettyDate(payment.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2>Payment plan</h2>
            {plan ? <span><Pill value={plan.status} />{plan.approvalId && plan.status === "pending approval" ? <> <a href={`/approvals/${plan.approvalId}`}>request →</a></> : null}</span> : null}
          </div>
          {!plan ? <p className="empty">No payment plan.{pastDue ? ` Propose one to work ${nameOf(invoice.accountId)} off credit hold.` : ""}</p> : (
            <table>
              <thead><tr><th>#</th><th>Due</th><th className="num">Amount</th><th>Paid</th></tr></thead>
              <tbody>
                {schedule.map((item) => (
                  <tr key={item.number}>
                    <td>{item.number}</td>
                    <td>{prettyDate(item.due)}</td>
                    <td className="num">{money(item.amount)}</td>
                    <td>{item.paid ? <span className="pill good">paid</span> : <span className="pill gray">open</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <h2 style={{ margin: "20px 0 12px" }}>Activity</h2>
          <Timeline entries={activityFor(activity, "invoice", id)} nameOf={nameOf} />
        </section>
      </div>
    </section>
  );
}
