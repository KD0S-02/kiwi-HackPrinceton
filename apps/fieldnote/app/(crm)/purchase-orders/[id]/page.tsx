import { notFound } from "next/navigation";
import { ActionButton } from "../../../../components/ActionButton";
import { DeleteButton } from "../../../../components/DeleteButton";
import { Pill } from "../../../../components/RecordLink";
import { StatusPath } from "../../../../components/StatusPath";
import { Timeline } from "../../../../components/Timeline";
import { loadNames, money, prettyDate, round2 } from "../../../../lib/data";
import { signedInUser } from "../../../../lib/session";
import { activityFor } from "../../../../lib/workflow/activity";
import { preflight } from "../../../../lib/workflow/actions";
import { poStatus } from "../../../../lib/workflow/actions/purchasing";
import { find, num, openDb } from "../../../../lib/workflow/db";
import { opsCheck } from "../../../../lib/workflow/permissions";
import { backorderedStock, familiesFor, freeStock } from "../../../../lib/workflow/stock";

export const dynamic = "force-dynamic";

export default async function PurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = openDb();
  const po = await find(db, "purchase-orders.json", id);
  if (!po) notFound();
  const person = await signedInUser();
  const [nameOf, activity, allLines, products, rules] = await Promise.all([loadNames(), db.rows("activity.json"), db.rows("purchase-order-lines.json"), db.rows("products.json"), db.rules()]);
  const supplier = await find(db, "suppliers.json", po.supplierId);
  const lines = allLines.filter((row) => row.poId === id);
  const status = poStatus(po);
  const total = round2(lines.reduce((sum, line) => sum + num(line.quantity) * num(line.unitCost), 0));
  const minimum = num(supplier?.minOrderDollars);
  const supplierProducts = products.filter((row) => row.supplierId === po.supplierId);
  const families = familiesFor(rules, String(po.warehouseId));
  const backorders = await Promise.all(lines.map(async (line) => ({ line, waiting: await backorderedStock(db, String(line.productId), String(po.warehouseId)), free: await freeStock(db, String(line.productId), String(po.warehouseId)) })));
  const waitingLine = backorders.find((item) => item.waiting > 0);
  const [submitBlocked, sendBlocked, receiveBlocked, releaseBlocked] = await Promise.all([
    preflight("submit-po", person, { poId: id }),
    preflight("send-po", person, { poId: id }),
    preflight("receive-po", person, Object.fromEntries([["poId", id], ...lines.map((line) => [`received:${line.id}`, num(line.quantity) > num(line.received) ? "1" : "0"])])),
    waitingLine ? preflight("release-backorders", person, { productId: String(waitingLine.line.productId), warehouseId: String(po.warehouseId) }) : Promise.resolve("Nothing is waiting on this stock."),
  ]);
  // Editing lines only needs the person and the status; the line-specific rules show when they submit the dialog.
  const editBlocked = opsCheck(person) || (status !== "draft" ? `${id} is ${status}. Only a draft can change.` : "");

  return (
    <section>
      <div className="page-head">
        <div>
          <div className="crumb"><a href="/supply">Supply</a> / <a href="/purchase-orders">Purchase orders</a> / {id}</div>
          <h1>{id} · {nameOf(po.supplierId)}</h1>
          <p>Deliver to {nameOf(po.warehouseId)} ({families.join(", ") || "any family"}) · created by {nameOf(po.createdBy)}{po.expectedDate ? ` · expected ${prettyDate(po.expectedDate)}` : ""}</p>
        </div>
        <div className="actions">
          {status === "draft" ? <DeleteButton endpoint={`/api/records/purchase-orders/${id}`} name={id} redirect="/supply" /> : null}
          <ActionButton
            kiwi="add-po-line"
            icon="plus"
            label="Add line"
            title={`Add a ${nameOf(po.supplierId)} product`}
            description={`Only ${nameOf(po.supplierId)} products, and only families ${nameOf(po.warehouseId)} receives.`}
            action="add-po-line"
            hidden={{ poId: id }}
            submit="Add line"
            blocked={editBlocked}
            why="title"
            fields={[
              { name: "productId", label: "Product", type: "select", options: supplierProducts.map((row) => ({ value: String(row.id), label: `${String(row.name)} · ${String(row.family)} · ${money(row.cost)}` })) },
              { name: "quantity", label: "Quantity", type: "number", required: true, value: "12", min: 1 },
            ]}
          />
          <ActionButton kiwi="submit-po" icon="check" label="Submit" title={`Submit ${id}`} description={`Over ${money(rules.purchaseOrderApprovalOverDollars)} goes to finance for approval.`} action="submit-po" hidden={{ poId: id }} submit="Submit" blocked={submitBlocked} why={status === "draft" && !opsCheck(person) ? "title" : "below"} fields={[]} />
          <ActionButton kiwi="send-po" icon="send" label="Send to supplier" title={`Send ${id} to ${nameOf(po.supplierId)}`} description={`Expected in ${num(supplier?.leadDays)} days.`} action="send-po" hidden={{ poId: id }} submit="Send" blocked={sendBlocked} why="title" fields={[]} />
          <ActionButton
            kiwi="receive-po"
            variant="primary"
            icon="box"
            label="Receive"
            title={`Receive ${id}`}
            description="Enter what arrived on each line. On-hand stock goes up."
            action="receive-po"
            hidden={{ poId: id }}
            submit="Receive"
            blocked={receiveBlocked}
            why="title"
            fields={lines.map((line) => ({ name: `received:${line.id}`, label: `${nameOf(line.productId)} · ${num(line.quantity) - num(line.received)} still due`, type: "number" as const, value: String(Math.max(0, num(line.quantity) - num(line.received))), min: 0 }))}
          />
        </div>
      </div>

      <StatusPath steps={["draft", "pending approval", "approved", "sent", "partially received", "received"]} current={status} />

      <div className="highlights">
        <div className="highlight"><span>Total</span><strong>{money(total)}</strong></div>
        <div className={`highlight${status === "draft" && total < minimum ? " alert" : ""}`}><span>Supplier minimum</span><strong>{money(minimum)}</strong><small className="sub">{total >= minimum ? "met" : `${money(round2(minimum - total))} to go`}</small></div>
        <div className="highlight"><span>Status</span><strong><Pill value={status} /></strong>{po.approvalId ? <small className="sub"><a href={`/approvals/${po.approvalId}`}>approval {String(po.approvalId)}</a></small> : null}</div>
        <div className="highlight"><span>Expected</span><strong>{po.expectedDate ? prettyDate(po.expectedDate) : "—"}</strong><small className="sub">lead time {num(supplier?.leadDays)} days</small></div>
      </div>
      {submitBlocked && status === "draft" && !opsCheck(person) ? <p className="banner warn" data-kiwi="submit-po-why">{submitBlocked}</p> : null}

      <div className="book-layout">
        <section className="panel" data-kiwi="results">
          <div className="panel-head">
            <h2>Lines</h2>
            {waitingLine ? (
              <ActionButton
                small
                kiwi="release-backorders"
                icon="truck"
                label="Release backorders"
                title={`Release ${nameOf(waitingLine.line.productId)} backorders`}
                description={`${waitingLine.free} free at ${nameOf(po.warehouseId)} fills ${waitingLine.waiting} waiting, oldest order first.`}
                action="release-backorders"
                hidden={{ productId: String(waitingLine.line.productId), warehouseId: String(po.warehouseId) }}
                submit="Release"
                blocked={releaseBlocked}
                why="title"
                fields={[]}
              />
            ) : null}
          </div>
          <table>
            <thead><tr><th>Product</th><th className="num">Ordered</th><th className="num">Received</th><th className="num">Unit cost</th><th className="num">Total</th><th>Waiting orders</th><th></th></tr></thead>
            <tbody>
              {lines.length === 0 ? <tr><td colSpan={7} className="empty">No lines yet. Add a {nameOf(po.supplierId)} product.</td></tr> : backorders.map(({ line, waiting }) => (
                <tr key={String(line.id)}>
                  <td>{nameOf(line.productId)}</td>
                  <td className="num">{num(line.quantity)}</td>
                  <td className="num">{num(line.received)}</td>
                  <td className="num">{money(line.unitCost)}</td>
                  <td className="num">{money(round2(num(line.quantity) * num(line.unitCost)))}</td>
                  <td>{waiting > 0 ? <span className="pill bad">{waiting} backordered</span> : <span className="pill gray">none</span>}</td>
                  <td>
                    <ActionButton
                      small
                      kiwi={`edit-po-line-${line.productId}`}
                      icon="edit"
                      label="Edit"
                      title={`Edit ${nameOf(line.productId)}`}
                      action="edit-po-line"
                      hidden={{ lineId: String(line.id) }}
                      blocked={editBlocked}
                      why="title"
                      fields={[{ name: "quantity", label: "Quantity", type: "number", value: String(line.quantity), required: true, min: 1 }]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="panel">
          <h2 style={{ marginBottom: 12 }}>Activity</h2>
          <Timeline entries={activityFor(activity, "purchase-order", id)} nameOf={nameOf} />
        </section>
      </div>
    </section>
  );
}
