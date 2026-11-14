import { ActionButton } from "../../../components/ActionButton";
import { DeleteButton } from "../../../components/DeleteButton";
import { ExportLink } from "../../../components/ExportLink";
import { FilterBar } from "../../../components/FilterBar";
import { loadNames, money, readRecords, tone } from "../../../lib/data";
import { textMatches } from "../../../lib/filters";
import { loadFilters } from "../../../lib/page-filters";

export const dynamic = "force-dynamic";

export default async function FulfillmentPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  if (params.status === "all") delete params.status;
  const { filters, values } = await loadFilters("/orders", params);
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
  const min = Number(values.min || 0);
  const matching = orders.filter((row) =>
    (!values.warehouse || row.warehouseId === values.warehouse)
    && Number(row.amount) >= min
    && textMatches(values.q, [row.id, nameOf(row.accountId), nameOf(row.warehouseId)]));
  const shown = matching.filter((row) => !values.status || row.status === values.status);
  const warehouseOptions = warehouses.map((row) => ({ value: String(row.id), label: String(row.name) }));
  const statusOptions = [{ value: "open", label: "Open" }, { value: "delivered", label: "Delivered" }];
  const tabHref = (key: string) => {
    const query = new URLSearchParams(Object.entries(values).filter(([name, value]) => value && name !== "status"));
    if (key) query.set("status", key);
    const text = query.toString();
    return text ? `/orders?${text}` : "/orders";
  };
  const tabs = [
    { key: "", label: "All", count: matching.length },
    { key: "open", label: "Open", count: matching.filter((row) => row.status === "open").length },
    { key: "delivered", label: "Delivered", count: matching.filter((row) => row.status === "delivered").length },
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
              { name: "warehouseId", label: "Ships from", type: "select", options: warehouseOptions },
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

      <section className="panel" data-kiwi="results">
        <nav className="tabs" style={{ marginBottom: 12 }}>
          {tabs.map((item) => (
            <a key={item.key || "all"} className={values.status === item.key ? "active" : ""} href={tabHref(item.key)}>{item.label}<small>{item.count}</small></a>
          ))}
        </nav>
        <FilterBar path="/orders" filters={filters} values={values} shown={shown.length} total={orders.length} noun="orders" />
        <div className="scroll tall">
          <table>
            <thead><tr><th>Order</th><th>Restaurant</th><th>Warehouse</th><th>Status</th><th className="num">Amount</th><th></th></tr></thead>
            <tbody>
              {shown.length === 0 ? <tr><td colSpan={6} className="empty">No orders match those filters.</td></tr> : shown.map((row) => (
                <tr key={String(row.id)}>
                  <td>{String(row.id)}</td>
                  <td><a href={`/accounts/${row.accountId}`}>{nameOf(row.accountId)}</a></td>
                  <td>{nameOf(row.warehouseId)}</td>
                  <td><span className={`pill ${tone(row.status)}`}>{String(row.status)}</span></td>
                  <td className="num">{money(row.amount)}</td>
                  <td>
                    <div className="row-actions">
                      <ActionButton
                        small
                        icon="edit"
                        label="Edit"
                        title={`Edit ${String(row.id)}`}
                        endpoint={`/api/records/orders/${row.id}`}
                        method="PATCH"
                        fields={[
                          { name: "status", label: "Status", type: "select", value: String(row.status), options: statusOptions },
                          { name: "warehouseId", label: "Ships from", type: "select", value: String(row.warehouseId), options: warehouseOptions },
                          { name: "amount", label: "Amount", type: "number", value: String(row.amount) },
                        ]}
                      />
                      <DeleteButton small endpoint={`/api/records/orders/${row.id}`} name={String(row.id)} />
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
          <div className="panel-head"><h2>Shipments</h2><a href="/shipments">All {shipments.length} →</a></div>
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
          <div className="panel-head">
            <h2>Cases <a className="head-link" href="/cases">All {cases.length} →</a></h2>
            <ActionButton
              small
              icon="plus"
              label="New case"
              title="New case"
              endpoint="/api/records/cases"
              fields={[
                { name: "accountId", label: "Restaurant", type: "select", required: true, options: accounts.map((row) => ({ value: String(row.id), label: String(row.name) })) },
                { name: "kind", label: "Kind", type: "select", options: ["delivery complaint", "missing item", "billing question"].map((value) => ({ value, label: value })) },
              ]}
            />
          </div>
          <div className="scroll short">
            {cases.map((row) => (
              <div className="line" key={String(row.id)}>
                <strong>{nameOf(row.accountId)}</strong>
                <span>{String(row.kind)}</span>
                <ActionButton
                  small
                  label={String(row.status)}
                  title={`Case for ${nameOf(row.accountId)}`}
                  endpoint={`/api/records/cases/${row.id}`}
                  method="PATCH"
                  submit="Save case"
                  fields={[
                    { name: "status", label: "Status", type: "select", value: String(row.status), options: [{ value: "open", label: "Open" }, { value: "closed", label: "Closed" }] },
                    { name: "kind", label: "Kind", type: "select", value: String(row.kind), options: ["delivery complaint", "missing item", "billing question"].map((value) => ({ value, label: value })) },
                  ]}
                />
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
