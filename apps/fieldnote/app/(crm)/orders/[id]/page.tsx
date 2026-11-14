import { notFound } from "next/navigation";
import { ActionButton } from "../../../../components/ActionButton";
import { Pill, RecordLink } from "../../../../components/RecordLink";
import { StatusPath } from "../../../../components/StatusPath";
import { Timeline } from "../../../../components/Timeline";
import { loadNames, money, prettyDate, round2 } from "../../../../lib/data";
import { signedInUser } from "../../../../lib/session";
import { activityFor } from "../../../../lib/workflow/activity";
import { preflight } from "../../../../lib/workflow/actions";
import { find, num, openDb } from "../../../../lib/workflow/db";
import { lineWarehouse } from "../../../../lib/workflow/stock";

export const dynamic = "force-dynamic";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = openDb();
  const order = await find(db, "orders.json", id);
  if (!order) notFound();
  const person = await signedInUser();
  const [nameOf, activity, orderLines, invoices, shipments] = await Promise.all([loadNames(), db.rows("activity.json"), db.rows("order-lines.json"), db.rows("invoices.json"), db.rows("shipments.json")]);
  const account = await find(db, "accounts.json", order.accountId);
  const lines = orderLines.filter((row) => row.orderId === id);
  const invoice = invoices.find((row) => row.orderId === id);
  const orderShipments = shipments.filter((row) => row.orderId === id);
  const releaseBlocked = await preflight("release-order", person, { orderId: id });
  const status = String(order.status);

  return (
    <section>
      <div className="page-head">
        <div>
          <div className="crumb"><a href="/orders">Fulfillment</a> / {id}</div>
          <h1>Order for {nameOf(order.accountId)}</h1>
          <p>{id} · ships from {nameOf(order.warehouseId)} · delivery {prettyDate(order.deliveryDate)}</p>
        </div>
        <div className="actions">
          {order.quoteId ? <a className="btn ghost" href={`/quotes/${order.quoteId}`}>Open quote</a> : null}
          {invoice ? <a className="btn ghost" href={`/invoices/${invoice.id}`}>Open invoice</a> : null}
          {status === "held" ? (
            <ActionButton
              kiwi="release-order"
              variant="primary"
              icon="check"
              label="Release order"
              title={`Release ${id}`}
              description="Stock is reserved again. Lines with too little free stock are backordered."
              action="release-order"
              hidden={{ orderId: id }}
              submit="Release"
              blocked={releaseBlocked}
              fields={[]}
            />
          ) : null}
        </div>
      </div>

      <StatusPath steps={["open", "picking", "delivered"]} current={status} />

      {status === "held" ? <p className="banner bad"><strong>Held.</strong> {String(order.holdReason || account?.holdReason || "The account is on credit hold.")}</p> : null}
      {status === "backordered" ? <p className="banner warn"><strong>Backordered.</strong> Some lines are waiting on stock. They fill when a purchase order is received and backorders are released.</p> : null}

      <div className="highlights">
        <div className="highlight"><span>Amount</span><strong>{money(order.amount)}</strong></div>
        <div className="highlight"><span>Status</span><strong><Pill value={order.status} /></strong></div>
        <div className="highlight"><span>Invoice</span><strong>{invoice ? <RecordLink id={invoice.id} /> : "Not billed yet"}</strong></div>
        <div className="highlight"><span>Shipments</span><strong>{orderShipments.length ? orderShipments.map((row) => <RecordLink key={String(row.id)} id={row.id}>{`${row.id} `}</RecordLink>) : "None yet"}</strong></div>
      </div>

      <div className="split">
        <section className="panel">
          <h2 style={{ marginBottom: 12 }}>Lines</h2>
          <table>
            <thead><tr><th>Product</th><th>From</th><th className="num">Qty</th><th className="num">Allocated</th><th className="num">Backordered</th><th className="num">Total</th></tr></thead>
            <tbody>
              {lines.length === 0 ? <tr><td colSpan={6} className="empty">This order has no lines on file.</td></tr> : lines.map((line) => (
                <tr key={String(line.id)}>
                  <td>{nameOf(line.productId)}</td>
                  <td>{nameOf(lineWarehouse(line, order))}</td>
                  <td className="num">{num(line.quantity)}</td>
                  <td className="num">{num(line.allocated)}</td>
                  <td className="num">{num(line.backordered) > 0 ? <span className="pill bad">{num(line.backordered)}</span> : 0}</td>
                  <td className="num">{money(round2(num(line.quantity) * num(line.unitPrice)))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="panel">
          <h2 style={{ marginBottom: 12 }}>Activity</h2>
          <Timeline entries={activityFor(activity, "order", id)} nameOf={nameOf} />
        </section>
      </div>
    </section>
  );
}
