import { loadNames, money, readRecords } from "../../../lib/data";

export const dynamic = "force-dynamic";

function matches(row: Record<string, unknown>, keys: string[], needle: string) {
  return keys.some((key) => String(row[key] ?? "").toLowerCase().includes(needle));
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const needle = q.trim().toLowerCase();
  const [accounts, opportunities, products, contacts, employees, nameOf] = await Promise.all([
    readRecords("accounts.json"),
    readRecords("opportunities.json"),
    readRecords("products.json"),
    readRecords("contacts.json"),
    readRecords("employees.json"),
    loadNames(),
  ]);
  const found = {
    accounts: needle ? accounts.filter((row) => matches(row, ["name", "buyerName", "usualOrder"], needle)) : [],
    opportunities: needle ? opportunities.filter((row) => matches(row, ["name"], needle)) : [],
    products: needle ? products.filter((row) => matches(row, ["name", "sku", "family"], needle)) : [],
    people: needle ? [...contacts, ...employees].filter((row) => matches(row, ["name"], needle)) : [],
  };
  const total = found.accounts.length + found.opportunities.length + found.products.length + found.people.length;

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>{q ? `Results for “${q}”` : "Search"}</h1>
          <p>{q ? `${total} matches across restaurants, deals, products, and people.` : "Type in the search box at the top of any page."}</p>
        </div>
      </div>
      {q && total === 0 ? <section className="panel"><p className="empty">Nothing matches “{q}”. Try a restaurant, a buyer, or a product.</p></section> : null}
      <div className="split">
        <div className="results">
          {found.accounts.length > 0 && (
            <section className="panel">
              <div className="panel-head"><h2>Restaurants</h2><span>{found.accounts.length}</span></div>
              {found.accounts.map((row) => (
                <a className="result" key={String(row.id)} href={`/accounts/${row.id}`}>
                  <span className="avatar">{String(row.name).slice(0, 1)}</span>
                  <div><strong>{String(row.name)}</strong><small>{String(row.buyerName)} · {nameOf(row.territoryId)}</small></div>
                </a>
              ))}
            </section>
          )}
          {found.opportunities.length > 0 && (
            <section className="panel">
              <div className="panel-head"><h2>Deals</h2><span>{found.opportunities.length}</span></div>
              {found.opportunities.map((row) => (
                <a className="result" key={String(row.id)} href={`/opportunities/${row.id}`}>
                  <span className="avatar">$</span>
                  <div><strong>{String(row.name)}</strong><small>{String(row.stage)} · {money(row.amount)} · {String(row.discountPercent)}% discount</small></div>
                </a>
              ))}
            </section>
          )}
        </div>
        <div className="results">
          {found.products.length > 0 && (
            <section className="panel">
              <div className="panel-head"><h2>Products</h2><span>{found.products.length}</span></div>
              {found.products.map((row) => (
                <div className="result" key={String(row.id)}>
                  <span className="avatar">P</span>
                  <div><strong>{String(row.name)}</strong><small>{String(row.sku)} · {money(row.price)} per {String(row.unit)}</small></div>
                </div>
              ))}
            </section>
          )}
          {found.people.length > 0 && (
            <section className="panel">
              <div className="panel-head"><h2>People</h2><span>{found.people.length}</span></div>
              {found.people.map((row) => (
                <div className="result" key={String(row.id)}>
                  <span className="avatar">{String(row.name).slice(0, 1)}</span>
                  <div><strong>{String(row.name)}</strong><small>{String(row.role ?? "")}</small></div>
                </div>
              ))}
            </section>
          )}
        </div>
      </div>
    </section>
  );
}
