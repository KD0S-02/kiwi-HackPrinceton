import { ActionButton } from "../../../components/ActionButton";
import { DeleteButton } from "../../../components/DeleteButton";
import { ExportLink } from "../../../components/ExportLink";
import { FilterBar } from "../../../components/FilterBar";
import { Pill } from "../../../components/RecordLink";
import { loadNames, money, prettyDate, type Row } from "../../../lib/data";
import { textMatches } from "../../../lib/filters";
import { loadFilters } from "../../../lib/page-filters";
import { seesAll } from "../../../lib/people";
import { signedInUser } from "../../../lib/session";
import { num, openDb } from "../../../lib/workflow/db";
import { invoiceBalance, isPastDue } from "../../../lib/workflow/money";

export const dynamic = "force-dynamic";

const caseKinds = ["delivery complaint", "missing item", "billing question"];

export default async function FulfillmentPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  if (params.status === "all") delete params.status;
  const { filters, values } = await loadFilters("/orders", params);
  const db = openDb();
  const person = await signedInUser();
  const [orders, invoices, shipments, cases, accounts, rules, nameOf] = await Promise.all([
    db.rows("orders.json"),
    db.rows("invoices.json"),
    db.rows("shipments.json"),
    db.rows("cases.json"),
    db.rows("accounts.json"),
    db.rules(),
    loadNames(),
  ]);
  const byNewest = (rows: Row[]) => [...rows].sort((a, b) => String(b.id).localeCompare(String(a.id), undefined, { numeric: true }));
  const active = orders.filter((row) => ["open", "picking", "backordered", "held"].includes(String(row.status)));
  const delivered = orders.filter((row) => row.status === "delivered");
  const openCases = cases.filter((row) => row.status !== "closed");
  const owed = invoices.reduce((sum, row) => sum + invoiceBalance(row), 0);
  const pastDue = invoices.filter((row) => isPastDue(row, rules));
  const min = Number(values.min || 0);
  const matching = orders.filter((row) =>
    (!values.warehouse || row.warehouseId === values.warehouse)
    && num(row.amount) >= min
    && textMatches(values.q, [row.id, nameOf(row.accountId), nameOf(row.warehouseId)]));
  const shown = byNewest(matching.filter((row) => !values.status || row.status === values.status));
  const myAccounts = seesAll(person) ? accounts : accounts.filter((row) => row.ownerId === person.id);
  const tabHref = (key: string) => {
    const query = new URLSearchParams(Object.entries(values).filter(([name, value]) => value && name !== "status"));
    if (key) query.set("status", key);
    const text = query.toString();
    return text ? `/orders?${text}` : "/orders";
  };
  const tabs = [
    { key: "", label: "All" },
    { key: "open", label: "Open" },
    { key: "backordered", label: "Backordered" },
    { key: "held", label: "Held" },
    { key: "delivered", label: "Delivered" },
  ].map((tab) => ({ ...tab, count: tab.key ? matching.filter((row) => row.status === tab.key).length : matching.length }));

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Fulfillment</h1>
          <p>What left the warehouse, what is still open, what is waiting on stock or credit, and which restaurants called about it.</p>
        </div>
        <div className="actions">
          <ExportLink name="orders" />
          <ActionButton
            variant="primary"
            icon="plus"
            kiwi="new-order"
            label="New order"
            title="New order"
            description="Refused for restaurants that are onboarding, on credit hold, or over their available credit."
            endpoint="/api/records/orders"
            redirect="/orders/{id}"
            submit="Create order"
            fields={[
              { name: "accountId", label: "Restaurant", type: "select", required: true, options: myAccounts.map((row) => ({ value: String(row.id), label: `${String(row.name)}${row.creditHold === "yes" ? " (on hold)" : row.status === "onboarding" ? " (onboarding)" : ""}` })) },
              { name: "amount", label: "Amount", type: "number", placeholder: "1500", required: true },
            ]}
          />
        </div>
      </div>

      <div className="stats">
        <article className="card stat tone-amber"><span>Active orders</span><strong>{active.length}</strong><em>{active.filter((row) => row.status === "backordered").length} backordered · {active.filter((row) => row.status === "held").length} held</em></article>
        <article className="card stat tone-green"><span>Delivered</span><strong>{delivered.length}</strong><em>of {orders.length} orders</em></article>
        <article className="card stat"><span>Owed to us</span><strong>{money(Math.round(owed))}</strong><em>{pastDue.length} invoice{pastDue.length === 1 ? "" : "s"} past due</em></article>
        <article className="card stat tone-red"><span>Open cases</span><strong>{openCases.length}</strong><em>{shipments.filter((row) => row.status === "scheduled").length} redeliveries scheduled</em></article>
      </div>

      <section className="panel" data-kiwi="results">
        <nav className="tabs" style={{ marginBottom: 12 }}>
          {tabs.map((item) => (
            <a key={item.key || "all"} className={(values.status ?? "") === item.key ? "active" : ""} href={tabHref(item.key)}>{item.label}<small>{item.count}</small></a>
          ))}
        </nav>
        <FilterBar path="/orders" filters={filters} values={values} shown={shown.length} total={orders.length} noun="orders" />
        <div className="scroll tall">
          <table>
            <thead><tr><th>Order</th><th>Restaurant</th><th>Warehouse</th><th>Delivery</th><th>Status</th><th className="num">Amount</th><th></th></tr></thead>
            <tbody>
              {shown.length === 0 ? <tr><td colSpan={7} className="empty">No orders match those filters.</td></tr> : shown.map((row) => (
                <tr key={String(row.id)}>
                  <td><a href={`/orders/${row.id}`}>{String(row.id)}</a></td>
                  <td><a href={`/accounts/${row.accountId}`}>{nameOf(row.accountId)}</a></td>
                  <td>{nameOf(row.warehouseId)}</td>
                  <td>{prettyDate(row.deliveryDate)}</td>
                  <td><Pill value={row.status} /></td>
                  <td className="num">{money(row.amount)}</td>
                  <td>
                    <div className="row-actions">
                      <a className="btn ghost small" href={`/orders/${row.id}`}>Open</a>
                      {row.status === "open" && !row.quoteId ? <DeleteButton small endpoint={`/api/records/orders/${row.id}`} name={String(row.id)} /> : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="triple">
        <section className="panel">
          <div className="panel-head"><h2>Invoices</h2><a href="/invoices">All {invoices.length} →</a></div>
          <div className="scroll short">
            {byNewest(invoices).map((row) => (
              <a className="line" key={String(row.id)} href={`/invoices/${row.id}`}>
                <strong>{nameOf(row.accountId)}</strong>
                {isPastDue(row, rules) ? <span className="pill bad">past due</span> : <Pill value={row.status} />}
                <span>{money(invoiceBalance(row) || row.amount)}</span>
              </a>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Shipments</h2><a href="/shipments">All {shipments.length} →</a></div>
          <div className="scroll short">
            {byNewest(shipments).map((row) => (
              <a className="line" key={String(row.id)} href={`/shipments/${row.id}`}>
                <strong>{nameOf(row.accountId)}</strong>
                <span>{row.redeliveryOf ? "redelivery · " : ""}{prettyDate(row.deliveryDate)}</span>
                <Pill value={row.status} />
              </a>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2>Cases <a className="head-link" href="/cases">All {cases.length} →</a></h2>
            <ActionButton
              small
              icon="plus"
              label="New case"
              title="New case"
              endpoint="/api/records/cases"
              redirect="/cases/{id}"
              fields={[
                { name: "accountId", label: "Restaurant", type: "select", required: true, options: myAccounts.map((row) => ({ value: String(row.id), label: String(row.name) })) },
                { name: "kind", label: "Kind", type: "select", options: caseKinds.map((value) => ({ value, label: value })) },
                { name: "subject", label: "What happened", placeholder: "Friday truck was late" },
              ]}
            />
          </div>
          <div className="scroll short">
            {byNewest(cases).sort((a, b) => Number(a.status === "closed") - Number(b.status === "closed")).map((row) => (
              <a className="line" key={String(row.id)} href={`/cases/${row.id}`}>
                <strong>{nameOf(row.accountId)}</strong>
                <span>{String(row.subject && row.subject !== row.kind ? row.subject : row.kind)}</span>
                <Pill value={row.status} />
              </a>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
