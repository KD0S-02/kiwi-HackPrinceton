import { notFound } from "next/navigation";
import { ActionButton } from "../../../../components/ActionButton";
import { Pill, RecordLink } from "../../../../components/RecordLink";
import { StatusPath } from "../../../../components/StatusPath";
import { Timeline } from "../../../../components/Timeline";
import { loadNames, prettyDate } from "../../../../lib/data";
import { signedInUser } from "../../../../lib/session";
import { activityFor } from "../../../../lib/workflow/activity";
import { preflight } from "../../../../lib/workflow/actions";
import { openShort } from "../../../../lib/workflow/actions/cases";
import { find, num, openDb } from "../../../../lib/workflow/db";
import { deliveryDates } from "../../../../lib/workflow/money";
import { freeForAccount } from "../../../../lib/workflow/stock";

export const dynamic = "force-dynamic";

export default async function ShipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = openDb();
  const shipment = await find(db, "shipments.json", id);
  if (!shipment) notFound();
  const person = await signedInUser();
  const [nameOf, activity, allLines, shipments, cases, rules] = await Promise.all([loadNames(), db.rows("activity.json"), db.rows("shipment-lines.json"), db.rows("shipments.json"), db.rows("cases.json"), db.rules()]);
  const account = await find(db, "accounts.json", shipment.accountId);
  const lines = allLines.filter((line) => line.shipmentId === id);
  const dates = deliveryDates(account, rules);
  const redeliveries = shipments.filter((row) => row.redeliveryOf === id);
  const linkedCase = cases.find((row) => row.shipmentId === id);
  const parent = shipment.redeliveryOf ? await find(db, "shipments.json", shipment.redeliveryOf) : undefined;
  const rows = await Promise.all(
    lines.map(async (line) => {
      const open = await openShort(db, line);
      const free = await freeForAccount(db, account, String(line.productId));
      const product = String(line.productId);
      const [shortBlocked, redeliverBlocked] = await Promise.all([
        preflight("report-short", person, { shipmentLineId: String(line.id), short: "1" }),
        preflight("schedule-redelivery", person, { shipmentLineId: String(line.id), quantity: String(Math.max(1, open)), date: dates[0] ?? "" }),
      ]);
      return { line, open, free, product, shortBlocked, redeliverBlocked };
    }),
  );

  return (
    <section>
      <div className="page-head">
        <div>
          <div className="crumb"><a href="/orders">Fulfillment</a> / <a href="/shipments">Shipments</a> / {id}</div>
          <h1>{shipment.redeliveryOf ? "Redelivery" : "Shipment"} to {nameOf(shipment.accountId)}</h1>
          <p>{id} · from {nameOf(shipment.warehouseId)} · {shipment.status === "delivered" ? "delivered" : "due"} {prettyDate(shipment.deliveryDate)}</p>
        </div>
        <div className="actions">
          {linkedCase ? <a className="btn ghost" href={`/cases/${linkedCase.id}`}>Open case</a> : null}
          {shipment.orderId ? <a className="btn ghost" href={`/orders/${shipment.orderId}`}>Open order</a> : null}
        </div>
      </div>

      <StatusPath steps={shipment.redeliveryOf ? ["scheduled", "in transit", "delivered"] : ["picking", "in transit", "delivered"]} current={String(shipment.status)} />

      <section className="panel" data-kiwi="results">
        <div className="panel-head">
          <h2>Lines</h2>
          <span>Free stock is what the warehouses serving {nameOf(shipment.accountId)} can still promise. Redeliveries go out on {(String(account?.deliveryDays || rules.deliveryDays[String(account?.territoryId)] || "")).split("|").join(" and ")}.</span>
        </div>
        <table>
          <thead><tr><th>Product</th><th className="num">Shipped</th><th className="num">Short</th><th className="num">Redelivered</th><th className="num">Credited</th><th>Free to redeliver</th><th></th></tr></thead>
          <tbody>
            {rows.map(({ line, open, free, product, shortBlocked, redeliverBlocked }) => (
              <tr key={String(line.id)}>
                <td><strong>{nameOf(line.productId)}</strong>{open > 0 ? <small className="sub warn-text">{open} short with no redelivery or credit</small> : null}</td>
                <td className="num">{num(line.quantity)}</td>
                <td className="num">{num(line.short) > 0 ? <span className="pill bad">{num(line.short)}</span> : 0}</td>
                <td className="num">{num(line.redelivered)}</td>
                <td className="num">{num(line.credited)}</td>
                <td><span className={`pill ${free.free >= Math.max(1, open) ? "good" : "warn"}`}>{free.free} free</span> <small className="muted">{free.warehouseName}</small></td>
                <td>
                  <div className="row-actions">
                    <ActionButton
                      small
                      kiwi={`report-short-${product}`}
                      icon="alert"
                      label="Report short"
                      title={`Report ${nameOf(line.productId)} short`}
                      description={`${num(line.quantity) - num(line.short)} of ${num(line.quantity)} can still be reported.`}
                      action="report-short"
                      hidden={{ shipmentLineId: String(line.id) }}
                      submit="Report short"
                      blocked={shortBlocked}
                      why="title"
                      fields={[{ name: "short", label: "How many were short", type: "number", required: true, value: "1", min: 1 }]}
                    />
                    <ActionButton
                      small
                      kiwi={`redeliver-${product}`}
                      icon="truck"
                      label="Redeliver"
                      title={`Redeliver ${nameOf(line.productId)}`}
                      description={`${free.free} free at ${free.warehouseName}. Only delivery days are offered.`}
                      action="schedule-redelivery"
                      hidden={{ shipmentLineId: String(line.id) }}
                      submit="Schedule redelivery"
                      blocked={redeliverBlocked}
                      why="title"
                      fields={[
                        { name: "quantity", label: "Quantity", type: "number", required: true, value: String(Math.max(1, open)), min: 1 },
                        { name: "date", label: "Delivery date", type: "select", options: dates.map((day) => ({ value: day, label: prettyDate(day) })) },
                      ]}
                    />
                  </div>
                  {redeliverBlocked && open > 0 ? <p className="warning" data-kiwi={`redeliver-${product}-why`}>{redeliverBlocked}</p> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="split">
        <section className="panel">
          <h2 style={{ marginBottom: 12 }}>Related</h2>
          <dl className="facts">
            <dt>Order</dt><dd><RecordLink id={shipment.orderId} /></dd>
            <dt>Case</dt><dd>{linkedCase ? <RecordLink id={linkedCase.id}>{`${linkedCase.id} · ${linkedCase.status}`}</RecordLink> : "—"}</dd>
            {parent ? <><dt>Redelivery of</dt><dd><RecordLink id={parent.id} /></dd></> : null}
            <dt>Redeliveries</dt>
            <dd>{redeliveries.length === 0 ? "None yet" : redeliveries.map((row) => <span key={String(row.id)} className="inline-item"><RecordLink id={row.id} /> <Pill value={row.status} /> {prettyDate(row.deliveryDate)}</span>)}</dd>
          </dl>
        </section>
        <section className="panel">
          <h2 style={{ marginBottom: 12 }}>Activity</h2>
          <Timeline entries={activityFor(activity, "shipment", id)} nameOf={nameOf} />
        </section>
      </div>
    </section>
  );
}
