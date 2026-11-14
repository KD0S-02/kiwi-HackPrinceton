import { ActionButton } from "../../../components/ActionButton";
import { DeleteButton } from "../../../components/DeleteButton";
import { ExportLink } from "../../../components/ExportLink";
import { FilterBar } from "../../../components/FilterBar";
import { loadNames, readRecords } from "../../../lib/data";
import { ownerMatches, textMatches } from "../../../lib/filters";
import { loadFilters } from "../../../lib/page-filters";

export const dynamic = "force-dynamic";

export default async function AccountsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  if (params.scope && !params.owner) params.owner = params.scope;
  const { filters, values } = await loadFilters("/accounts", params);
  const [accounts, contacts, territories, warehouses, nameOf] = await Promise.all([
    readRecords("accounts.json"),
    readRecords("contacts.json"),
    readRecords("territories.json"),
    readRecords("warehouses.json"),
    loadNames(),
  ]);
  const mine = accounts.filter((row) => row.ownerId === "user");
  const filtered = accounts.filter((row) =>
    ownerMatches(row.ownerId, values.owner)
    && (!values.territory || row.territoryId === values.territory)
    && (!values.warehouse || row.warehouseId === values.warehouse)
    && textMatches(values.q, [row.name, row.buyerName, row.usualOrder, nameOf(row.territoryId), nameOf(row.warehouseId)]));
  const territoryOptions = territories.map((row) => ({ value: String(row.id), label: String(row.name) }));
  const warehouseOptions = warehouses.map((row) => ({ value: String(row.id), label: String(row.name) }));
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
              { name: "territoryId", label: "Territory", type: "select", options: territoryOptions },
              { name: "warehouseId", label: "Warehouse", type: "select", options: warehouseOptions },
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
          <div className="panel-head"><h2>Buyers</h2><a href="/contacts">All contacts →</a></div>
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

      <section className="panel" data-kiwi="results">
        <div className="panel-head">
          <h2>All restaurants</h2>
        </div>
        <FilterBar path="/accounts" filters={filters} values={values} shown={filtered.length} total={accounts.length} noun="restaurants" />
        <div className="scroll tall">
          <table>
            <thead><tr><th>Restaurant</th><th>Buyer</th><th>Territory</th><th>Owner</th><th>Warehouse</th><th>Usual order</th><th></th></tr></thead>
            <tbody>
              {filtered.length === 0 ? <tr><td colSpan={7} className="empty">Nothing matches those filters.</td></tr> : filtered.map((row) => (
                <tr key={String(row.id)}>
                  <td><a href={`/accounts/${row.id}`}>{row.name}</a></td>
                  <td>{row.buyerName}</td>
                  <td>{nameOf(row.territoryId)}</td>
                  <td>{nameOf(row.ownerId)}</td>
                  <td>{nameOf(row.warehouseId)}</td>
                  <td>{row.usualOrder}</td>
                  <td>
                    <div className="row-actions">
                      <ActionButton
                        small
                        icon="edit"
                        label="Edit"
                        title={`Edit ${String(row.name)}`}
                        endpoint={`/api/records/accounts/${row.id}`}
                        method="PATCH"
                        fields={[
                          { name: "name", label: "Restaurant name", value: String(row.name), required: true },
                          { name: "buyerName", label: "Buyer", value: String(row.buyerName ?? "") },
                          { name: "usualOrder", label: "Usual order", value: String(row.usualOrder ?? "") },
                          { name: "territoryId", label: "Territory", type: "select", value: String(row.territoryId), options: territoryOptions },
                          { name: "warehouseId", label: "Warehouse", type: "select", value: String(row.warehouseId), options: warehouseOptions },
                        ]}
                      />
                      <DeleteButton small endpoint={`/api/records/accounts/${row.id}`} name={String(row.name)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
