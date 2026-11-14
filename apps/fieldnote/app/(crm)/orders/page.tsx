import { ActionButton } from "../../../components/ActionButton";
import { ExportLink } from "../../../components/ExportLink";
import { loadNames, money, readRecords, tone } from "../../../lib/data";

export const dynamic = "force-dynamic";

export default async function FulfillmentPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = "all" } = await searchParams;
  const [orders, invoices, shipments, cases, accounts, warehouses, nameOf] = await Promise.all([
    readRecords("orders.json"),
    readRecords("invoices.json"),
    readRecords("shipments.json"),
    readRecords("cases.json"),
    readRecords("accounts.json"),
    readRecords("warehouses.json"),
    loadNames(),
  ]);
  const openOrders = orders.filter((row) => row.status === "open");
  const delivered = orders.filter((row) => row.status === "delivered");
  const openCases = cases.filter((row) => row.status === "open");
  const billed = invoices.reduce((sum, row) => sum + Number(row.amount), 0);
  const shown = status === "all" ? orders : orders.filter((row) => row.status === status);
  const tabs = [
    { key: "all", label: "All", count: orders.length },
    { key: "open", label: "Open", count: openOrders.length },
    { key: "delivered", label: "Delivered", count: delivered.length },
  ];

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Fulfillment</h1>
          <p>What left the warehouse, what is still open, and which restaurants called about it.</p>
        </div>
        <div className="actions">
          <ExportLink name="orders" />
          <ActionButton
            variant="primary"
            icon="plus"
            label="New order"
            title="New order"
            endpoint="/api/records/orders"
            submit="Create order"
            fields={[
              { name: "accountId", label: "Restaurant", type: "select", required: true, options: accounts.map((row) => ({ value: String(row.id), label: String(row.name) })) },
              { name: "warehouseId", label: "Ships from", type: "select", options: warehouses.map((row) => ({ value: String(row.id), label: String(row.name) })) },
              { name: "amount", label: "Amount", type: "number", placeholder: "1500", required: true },
            ]}
          />
        </div>
      </div>

      <div className="stats">
        <article className="card stat tone-amber"><span>Open orders</span><strong>{openOrders.length}</strong><em>{money(openOrders.reduce((sum, row) => sum + Number(row.amount), 0))}</em></article>
        <article className="card stat tone-green"><span>Delivered</span><strong>{delivered.length}</strong><em>of {orders.length} orders</em></article>
        <article className="card stat"><span>Invoiced</span><strong>{money(billed)}</strong><em>{invoices.length} invoices</em></article>
        <article className="card stat tone-red"><span>Open cases</span><strong>{openCases.length}</strong><em>{shipments.length} shipments on file</em></article>
      </div>

      <section className="panel">
        <nav className="tabs" style={{ marginBottom: 12 }}>
          {tabs.map((item) => (
            <a key={item.key} className={status === item.key ? "active" : ""} href={`/orders?status=${item.key}`}>{item.label}<small>{item.count}</small></a>
          ))}
        </nav>
        <div className="scroll tall">
          <table>
            <thead><tr><th>Order</th><th>Restaurant</th><th>Warehouse</th><th>Status</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {shown.length === 0 ? <tr><td colSpan={5} className="empty">No orders here.</td></tr> : shown.map((row) => (
                <tr key={String(row.id)}>
                  <td>{String(row.id)}</td>
                  <td><a href={`/accounts/${row.accountId}`}>{nameOf(row.accountId)}</a></td>
                  <td>{nameOf(row.warehouseId)}</td>
                  <td><span className={`pill ${tone(row.status)}`}>{String(row.status)}</span></td>
                  <td className="num">{money(row.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="triple">
        <section className="panel">
          <div className="panel-head"><h2>Invoices</h2><span>{invoices.length}</span></div>
          <div className="scroll short">
            {invoices.map((row) => (
              <div className="line" key={String(row.id)}>
                <strong>{nameOf(row.accountId)}</strong>
                <span className={`pill ${tone(row.status)}`}>{String(row.status)}</span>
                <span>{money(row.amount)}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Shipments</h2><span>{shipments.length}</span></div>
          <div className="scroll short">
            {shipments.map((row) => (
              <div className="line" key={String(row.id)}>
                <strong>{nameOf(row.accountId)}</strong>
                <span>{nameOf(row.warehouseId)}</span>
                <span className={`pill ${tone(row.status) || "gray"}`}>{String(row.status)}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Cases</h2><span>{cases.length}</span></div>
          <div className="scroll short">
            {cases.map((row) => (
              <div className="line" key={String(row.id)}>
                <strong>{nameOf(row.accountId)}</strong>
                <span>{String(row.kind)}</span>
                <span className={`pill ${tone(row.status)}`}>{String(row.status)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
