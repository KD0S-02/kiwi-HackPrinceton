import { ActionButton } from "../../../components/ActionButton";
import { ExportLink } from "../../../components/ExportLink";
import { loadNames, readRecords } from "../../../lib/data";

export const dynamic = "force-dynamic";

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ q?: string; scope?: string }> }) {
  const { q = "", scope = "all" } = await searchParams;
  const needle = q.trim().toLowerCase();
  const [accounts, contacts, territories, warehouses, nameOf] = await Promise.all([
    readRecords("accounts.json"),
    readRecords("contacts.json"),
    readRecords("territories.json"),
    readRecords("warehouses.json"),
    loadNames(),
  ]);
  const mine = accounts.filter((row) => row.ownerId === "user");
  const pool = scope === "mine" ? mine : accounts;
  const filtered = pool.filter((row) => {
    if (!needle) return true;
    return [row.name, row.buyerName, row.usualOrder, nameOf(row.territoryId), nameOf(row.warehouseId)].some((value) => String(value ?? "").toLowerCase().includes(needle));
  });
  const myContacts = contacts.filter((contact) => mine.some((account) => account.id === contact.accountId));

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Accounts</h1>
          <p>{mine.length} restaurants are yours. {accounts.length} are in the company.</p>
        </div>
        <div className="actions">
          <ActionButton
            icon="upload"
            label="Import"
            title="Import accounts"
            description="Paste CSV. The first row is the header: name, buyerName, usualOrder."
            endpoint="/api/records/accounts"
            csv
            submit="Import"
            fields={[{ name: "csv", label: "CSV rows", type: "textarea", required: true, placeholder: "name,buyerName,usualOrder\nTaylor Bistro,Sam Lee,napkins and gloves" }]}
          />
          <ExportLink name="accounts" />
          <ActionButton
            variant="primary"
            icon="plus"
            label="New account"
            title="New account"
            description="Add a restaurant to your book."
            endpoint="/api/records/accounts"
            submit="Create account"
            fields={[
              { name: "name", label: "Restaurant name", required: true, placeholder: "Taylor Bistro" },
              { name: "buyerName", label: "Buyer", placeholder: "Sam Lee" },
              { name: "usualOrder", label: "Usual order", placeholder: "napkins, fryer oil, and gloves" },
              { name: "territoryId", label: "Territory", type: "select", options: territories.map((row) => ({ value: String(row.id), label: String(row.name) })) },
              { name: "warehouseId", label: "Warehouse", type: "select", options: warehouses.map((row) => ({ value: String(row.id), label: String(row.name) })) },
            ]}
          />
        </div>
      </div>

      <div className="book-layout">
        <section>
          <div className="panel-head"><h2>Your book</h2><span>{mine.length} restaurants</span></div>
          <div className="book">
            {mine.map((account) => (
              <a className="restaurant" key={String(account.id)} href={`/accounts/${account.id}`}>
                <header>
                  <span className="avatar">{String(account.name).slice(0, 1)}</span>
                  <strong>{account.name}</strong>
                </header>
                <span>{account.buyerName}</span>
                <em>{account.usualOrder}</em>
                <small>{nameOf(account.territoryId)} · {nameOf(account.warehouseId)}</small>
              </a>
            ))}
          </div>
        </section>
        <aside className="panel">
          <div className="panel-head"><h2>Buyers</h2><span>{myContacts.length}</span></div>
          <div className="scroll tall">
            {myContacts.map((contact) => (
              <a className="person" key={String(contact.id)} href={`/accounts/${contact.accountId}`}>
                <span className="avatar">{String(contact.name).slice(0, 1)}</span>
                <div>
                  <strong>{contact.name}</strong>
                  <small>{nameOf(contact.accountId)} · {contact.role}</small>
                </div>
              </a>
            ))}
          </div>
        </aside>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>All restaurants</h2>
          <form className="toolbar" action="/accounts">
            <input name="q" defaultValue={q} placeholder="Search name, buyer, warehouse" />
            <select name="scope" defaultValue={scope}>
              <option value="all">Everyone</option>
              <option value="mine">Only mine</option>
            </select>
            <button className="btn ghost" type="submit">Search</button>
          </form>
        </div>
        <div className="scroll tall">
          <table>
            <thead><tr><th>Restaurant</th><th>Buyer</th><th>Territory</th><th>Owner</th><th>Warehouse</th><th>Usual order</th></tr></thead>
            <tbody>
              {filtered.length === 0 ? <tr><td colSpan={6} className="empty">Nothing matches that search.</td></tr> : filtered.map((row) => (
                <tr key={String(row.id)}>
                  <td><a href={`/accounts/${row.id}`}>{row.name}</a></td>
                  <td>{row.buyerName}</td>
                  <td>{nameOf(row.territoryId)}</td>
                  <td>{nameOf(row.ownerId)}</td>
                  <td>{nameOf(row.warehouseId)}</td>
                  <td>{row.usualOrder}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
