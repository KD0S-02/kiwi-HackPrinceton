import { notFound } from "next/navigation";
import { columnLabel, modules, readRecords, type Row } from "../../../lib/data";

export const dynamic = "force-dynamic";

export default async function ModuleListPage({
  params,
  searchParams,
}: {
  params: Promise<{ module: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { module: moduleKey } = await params;
  const { q = "" } = await searchParams;
  const moduleConfig = modules[moduleKey];
  if (!moduleConfig) notFound();
  const needle = q.trim().toLowerCase();
  const names = await namesById();
  const rows = (await readRecords(moduleConfig.file)).filter((row) => {
    if (!needle) return true;
    return Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(needle));
  });
  return (
    <section>
      <div className="page-head">
        <div>
          <div className="crumb">Fieldnote / {moduleConfig.title}</div>
          <h1>{moduleConfig.title}</h1>
        </div>
        <div className="actions">
          <button className="ghost" type="button">Filter</button>
          <button className="ghost" type="button">Export</button>
          <button className="primary" type="button">New</button>
        </div>
      </div>
      <form className="toolbar" action={`/${moduleKey}`}>
        <input name="q" defaultValue={q} placeholder={`Search ${moduleConfig.title.toLowerCase()}`} />
        <button className="ghost" type="submit">Search</button>
      </form>
      <div className="panel">
        {rows.length === 0 ? <p className="empty">No matching rows.</p> : (
          <table>
            <thead>
              <tr>
                {moduleConfig.columns.map((column) => <th key={column}>{columnLabel(column)}</th>)}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={String(row.id)}>
                  {moduleConfig.columns.map((column) => <td key={column}>{cell(moduleKey, column, row, names)}</td>)}
                  <td><a href={detailHref(moduleKey, row)}>Open</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="empty">{rows.length} {moduleConfig.title.toLowerCase()}</p>
      </div>
    </section>
  );
}

function detailHref(moduleKey: string, row: Row) {
  if (moduleKey === "opportunities") return `/opportunities/${row.id}`;
  return `/${moduleKey}/${row.id}`;
}

async function namesById() {
  const [employees, accounts, warehouses, territories, products] = await Promise.all([
    readRecords("employees.json"),
    readRecords("accounts.json"),
    readRecords("warehouses.json"),
    readRecords("territories.json"),
    readRecords("products.json"),
  ]);
  return new Map([...employees, ...accounts, ...warehouses, ...territories, ...products].map((row) => [String(row.id), String(row.name)]));
}

function cell(moduleKey: string, column: string, row: Row, names: Map<string, string>) {
  const value = row[column];
  if (typeof value === "string" && names.has(value) && column.endsWith("Id")) return names.get(value);
  if (column === "name") return <a href={detailHref(moduleKey, row)}>{value}</a>;
  if (column === "status" || column === "stage") {
    const tone = value === "open" || value === "pending" ? "warn" : value === "delivered" || value === "paid" || value === "sent" ? "good" : "";
    return <span className={`pill ${tone}`}>{value}</span>;
  }
  if (column === "discountPercent") {
    return <span className={Number(value) > 15 ? "pill bad" : "pill good"}>{value}%</span>;
  }
  if (column === "amount" || column === "price") return `$${Number(value).toLocaleString()}`;
  return String(value ?? "");
}
