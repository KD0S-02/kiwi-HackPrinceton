import { notFound } from "next/navigation";
import { columnLabel, modules, readRecords } from "../../../../lib/data";

export const dynamic = "force-dynamic";

export default async function ModuleDetailPage({ params }: { params: Promise<{ module: string; id: string }> }) {
  const { module: moduleKey, id } = await params;
  const moduleConfig = modules[moduleKey];
  if (!moduleConfig || moduleKey === "opportunities") notFound();
  const rows = await readRecords(moduleConfig.file);
  const row = rows.find((candidate) => candidate.id === id);
  if (!row) notFound();
  const [employees, warehouses, territories, accounts] = await Promise.all([
    readRecords("employees.json"),
    readRecords("warehouses.json"),
    readRecords("territories.json"),
    readRecords("accounts.json"),
  ]);
  const names = new Map([...employees, ...warehouses, ...territories, ...accounts].map((record) => [String(record.id), String(record.name)]));
  const orders = moduleKey === "accounts" ? (await readRecords("orders.json")).filter((order) => order.accountId === id) : [];
  const opportunities = moduleKey === "accounts" ? (await readRecords("opportunities.json")).filter((opportunity) => opportunity.accountId === id) : [];
  return (
    <section>
      <div className="record-head">
        <div>
          <div className="crumb">{moduleConfig.title} / {String(row.name ?? row.id)}</div>
          <h1>{String(row.name ?? row.id)}</h1>
        </div>
        <div className="actions">
          <button className="ghost" type="button">Edit</button>
          <button className="ghost" type="button">Follow</button>
          <button className="primary" type="button">Log activity</button>
        </div>
      </div>
      <div className="highlights">
        {moduleConfig.columns.slice(0, 5).map((column) => (
          <div className="highlight" key={column}><span>{columnLabel(column)}</span><strong>{displayValue(column, row[column], names)}</strong></div>
        ))}
      </div>
      <div className="grid-2">
        <section className="panel">
          <h2>Details</h2>
          <table>
            <tbody>
              {Object.entries(row).map(([key, value]) => (
                <tr key={key}><th>{columnLabel(key)}</th><td>{displayValue(key, value, names)}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="panel">
          <h2>Related</h2>
          {moduleKey === "accounts" ? (
            <>
              <h3>Opportunities</h3>
              {opportunities.length === 0 ? <p className="empty">No opportunities.</p> : opportunities.map((opportunity) => (
                <p key={String(opportunity.id)}><a href={`/opportunities/${opportunity.id}`}>{opportunity.name}</a> · {opportunity.stage}</p>
              ))}
              <h3>Orders</h3>
              {orders.length === 0 ? <p className="empty">No orders.</p> : orders.map((order) => (
                <p key={String(order.id)}>{order.id} · {order.status}</p>
              ))}
            </>
          ) : <p className="empty">No related lists on this record.</p>}
        </section>
      </div>
    </section>
  );
}

function displayValue(key: string, value: string | number | null, names: Map<string, string>) {
  if (value == null || value === "") return "—";
  if (key.endsWith("Id") || key === "reportsTo" || key === "requestedBy") {
    return names.get(String(value)) ?? String(value);
  }
  return String(value);
}
