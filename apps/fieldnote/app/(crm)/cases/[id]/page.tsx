import { notFound } from "next/navigation";
import { ActionButton } from "../../../../components/ActionButton";
import { Pill, RecordLink } from "../../../../components/RecordLink";
import { StatusPath } from "../../../../components/StatusPath";
import { Timeline } from "../../../../components/Timeline";
import { loadNames, money, prettyDate } from "../../../../lib/data";
import { signedInUser } from "../../../../lib/session";
import { activityFor } from "../../../../lib/workflow/activity";
import { preflight } from "../../../../lib/workflow/actions";
import { callOutcomes, openShort, resolutions } from "../../../../lib/workflow/actions/cases";
import { find, num, openDb } from "../../../../lib/workflow/db";
import { invoiceBalance } from "../../../../lib/workflow/money";

export const dynamic = "force-dynamic";

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = openDb();
  const row = await find(db, "cases.json", id);
  if (!row) notFound();
  const person = await signedInUser();
  const [nameOf, activity, shipmentLines] = await Promise.all([loadNames(), db.rows("activity.json"), db.rows("shipment-lines.json")]);
  const shipment = await find(db, "shipments.json", row.shipmentId);
  const invoice = await find(db, "invoices.json", row.invoiceId);
  const order = await find(db, "orders.json", row.orderId);
  const lines = shipmentLines.filter((line) => line.shipmentId === row.shipmentId);
  const shorts = await Promise.all(lines.map(async (line) => ({ line, open: await openShort(db, line) })));
  const closeBlocked = await preflight("close-case", person, { caseId: id, resolution: "both" });
  const callBlocked = await preflight("log-call", person, { subjectType: "case", subjectId: id, outcome: "resolved", text: "check" });

  return (
    <section>
      <div className="page-head">
        <div>
          <div className="crumb"><a href="/orders">Fulfillment</a> / <a href="/cases">Cases</a> / {id}</div>
          <h1>{String(row.subject || row.kind)}</h1>
          <p><a href={`/accounts/${row.accountId}`}>{nameOf(row.accountId)}</a> · {String(row.kind)} · opened {prettyDate(row.openedAt)} · owned by {nameOf(row.ownerId)}</p>
        </div>
        <div className="actions">
          {shipment ? <a className="btn ghost" data-kiwi="open-shipment" href={`/shipments/${shipment.id}`}>Open shipment</a> : null}
          {invoice ? <a className="btn ghost" data-kiwi="open-invoice" href={`/invoices/${invoice.id}`}>Open invoice</a> : null}
          <ActionButton
            kiwi="log-call"
            icon="phone"
            label="Log call"
            title={`Log a call with ${nameOf(row.accountId)}`}
            action="log-call"
            hidden={{ subjectType: "case", subjectId: id }}
            blocked={callBlocked}
            why="title"
            fields={[
              { name: "outcome", label: "How it went", type: "select", options: callOutcomes.map((value) => ({ value, label: value })) },
              { name: "text", label: "Note", type: "textarea", required: true, placeholder: "Told the buyer the gloves come Tuesday." },
            ]}
          />
          <ActionButton
            kiwi="close-case"
            variant="primary"
            icon="check"
            label="Close case"
            title="Close case"
            description="Every short line needs a redelivery or a posted credit first."
            action="close-case"
            hidden={{ caseId: id }}
            submit="Close case"
            blocked={closeBlocked}
            fields={[{ name: "resolution", label: "Resolution", type: "select", value: "both", options: resolutions.map((value) => ({ value, label: value })) }]}
          />
        </div>
      </div>

      <StatusPath steps={["open", "investigating", "closed"]} current={String(row.status)} />

      <div className="highlights">
        <div className="highlight"><span>Order</span><strong><RecordLink id={row.orderId} /></strong></div>
        <div className="highlight"><span>Shipment</span><strong><RecordLink id={row.shipmentId} /></strong>{shipment ? <small className="sub">{String(shipment.status)} {prettyDate(shipment.deliveryDate)}</small> : null}</div>
        <div className="highlight"><span>Invoice</span><strong><RecordLink id={row.invoiceId} /></strong>{invoice ? <small className="sub">{money(invoiceBalance(invoice))} open</small> : null}</div>
        <div className="highlight"><span>Resolution</span><strong>{row.resolution ? String(row.resolution) : <Pill value={row.status} />}</strong></div>
      </div>

      <div className="split">
        <section className="panel">
          <div className="panel-head"><h2>What came short</h2>{shipment ? <a href={`/shipments/${shipment.id}`}>Shipment →</a> : null}</div>
          {lines.length === 0 ? <p className="empty">This case is not linked to a shipment.</p> : (
            <table>
              <thead><tr><th>Product</th><th className="num">Shipped</th><th className="num">Short</th><th className="num">Redelivered</th><th className="num">Credited</th><th>Open</th></tr></thead>
              <tbody>
                {shorts.map(({ line, open }) => (
                  <tr key={String(line.id)}>
                    <td>{nameOf(line.productId)}</td>
                    <td className="num">{num(line.quantity)}</td>
                    <td className="num">{num(line.short)}</td>
                    <td className="num">{num(line.redelivered)}</td>
                    <td className="num">{num(line.credited)}</td>
                    <td>{num(line.short) === 0 ? <span className="pill gray">none</span> : open > 0 ? <span className="pill bad">{open} open</span> : <span className="pill good">covered</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <ol className="steps-list">
            <li className={lines.some((line) => num(line.short) > 0) ? "done" : ""}>Report each short line on the shipment.</li>
            <li className={lines.some((line) => num(line.redelivered) > 0) ? "done" : ""}>Redeliver what is free on the next delivery day.</li>
            <li className={lines.some((line) => num(line.credited) > 0) ? "done" : ""}>Credit the rest on the invoice. Over $100 goes to the approver.</li>
            <li className={row.status === "closed" ? "done" : ""}>Close the case with a resolution.</li>
          </ol>
        </section>
        <section className="panel">
          <h2 style={{ marginBottom: 12 }}>Activity</h2>
          <Timeline entries={[...activityFor(activity, "case", id), ...(shipment ? activityFor(activity, "shipment", String(shipment.id)) : []), ...(invoice ? activityFor(activity, "invoice", String(invoice.id)) : [])].sort((a, b) => String(b.at ?? "").localeCompare(String(a.at ?? "")))} nameOf={nameOf} />
          {order ? <p className="muted" style={{ marginTop: 12 }}>Order {String(order.id)} · {money(order.amount)} · {String(order.status)}</p> : null}
        </section>
      </div>
    </section>
  );
}
