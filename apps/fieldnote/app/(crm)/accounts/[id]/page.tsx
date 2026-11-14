import { notFound } from "next/navigation";
import { ActionButton } from "../../../../components/ActionButton";
import { DeleteButton } from "../../../../components/DeleteButton";
import { FollowButton } from "../../../../components/FollowButton";
import { loadNames, money, readRecords, tone } from "../../../../lib/data";

export const dynamic = "force-dynamic";

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [accounts, contacts, opportunities, orders, cases, activity, territories, warehouses, nameOf] = await Promise.all([
    readRecords("accounts.json"),
    readRecords("contacts.json"),
    readRecords("opportunities.json"),
    readRecords("orders.json"),
    readRecords("cases.json"),
    readRecords("activity.json"),
    readRecords("territories.json"),
    readRecords("warehouses.json"),
    loadNames(),
  ]);
  const account = accounts.find((row) => row.id === id);
  if (!account) notFound();
  const buyers = contacts.filter((row) => row.accountId === id);
  const deals = opportunities.filter((row) => row.accountId === id);
  const accountOrders = orders.filter((row) => row.accountId === id);
  const accountCases = cases.filter((row) => row.accountId === id);
  const notes = activity
    .filter((row) => row.accountId === id || deals.some((deal) => deal.id === row.opportunityId))
    .reverse();
  const lifetime = accountOrders.reduce((sum, row) => sum + Number(row.amount), 0);

  return (
    <section>
      <div className="page-head">
        <div>
          <div className="crumb"><a href="/accounts">Accounts</a> / {String(account.name)}</div>
          <div className="record-title">
            <span className="avatar">{String(account.name).slice(0, 1)}</span>
            <div>
              <h1>{String(account.name)}</h1>
              <p>{nameOf(account.territoryId)} · {nameOf(account.warehouseId)} · owned by {nameOf(account.ownerId)}</p>
            </div>
          </div>
        </div>
        <div className="actions">
          <FollowButton id={id} />
          <ActionButton
            icon="edit"
            label="Edit"
            title={`Edit ${String(account.name)}`}
            endpoint={`/api/records/accounts/${id}`}
            method="PATCH"
            fields={[
              { name: "name", label: "Restaurant name", value: String(account.name), required: true },
              { name: "buyerName", label: "Buyer", value: String(account.buyerName ?? "") },
              { name: "usualOrder", label: "Usual order", value: String(account.usualOrder ?? "") },
              { name: "territoryId", label: "Territory", type: "select", value: String(account.territoryId), options: territories.map((row) => ({ value: String(row.id), label: String(row.name) })) },
              { name: "warehouseId", label: "Warehouse", type: "select", value: String(account.warehouseId), options: warehouses.map((row) => ({ value: String(row.id), label: String(row.name) })) },
            ]}
          />
          <DeleteButton endpoint={`/api/records/accounts/${id}`} name={String(account.name)} redirect="/accounts" />
          <ActionButton
            variant="primary"
            icon="note"
            label="Log activity"
            title="Log activity"
            description={`A note on ${String(account.name)} that your team can see.`}
            endpoint="/api/records/activity"
            hidden={{ accountId: id }}
            fields={[{ name: "text", label: "Note", type: "textarea", required: true, placeholder: "Called Priya about the standing order." }]}
          />
        </div>
      </div>

      <div className="highlights">
        <div className="highlight"><span>Buyer</span><strong>{String(account.buyerName ?? "—")}</strong></div>
        <div className="highlight"><span>Usual order</span><strong>{String(account.usualOrder ?? "—")}</strong></div>
        <div className="highlight"><span>Open deals</span><strong>{deals.length}</strong></div>
        <div className="highlight"><span>Orders to date</span><strong>{money(lifetime)}</strong></div>
      </div>

      <div className="split">
        <section className="panel">
          <div className="panel-head">
            <h2>Deals</h2>
            <a href="/pipeline">Pipeline →</a>
          </div>
          {deals.length === 0 ? <p className="empty">No deals yet.</p> : (
            <table>
              <thead><tr><th>Deal</th><th>Stage</th><th className="num">Amount</th><th>Discount</th></tr></thead>
              <tbody>
                {deals.map((row) => (
                  <tr key={String(row.id)}>
                    <td><a href={`/opportunities/${row.id}`}>{row.name}</a></td>
                    <td><span className="pill">{row.stage}</span></td>
                    <td className="num">{money(row.amount)}</td>
                    <td><span className={Number(row.discountPercent) > 15 ? "pill bad" : "pill good"}>{row.discountPercent}%</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2>Buyers</h2>
            <ActionButton
              small
              icon="plus"
              label="Add buyer"
              title="Add buyer"
              endpoint="/api/records/contacts"
              hidden={{ accountId: id }}
              fields={[
                { name: "name", label: "Name", required: true },
                { name: "role", label: "Role", value: "buyer" },
              ]}
            />
          </div>
          {buyers.length === 0 ? <p className="empty">No buyers on file.</p> : buyers.map((row) => (
            <div className="person" key={String(row.id)}>
              <span className="avatar">{String(row.name).slice(0, 1)}</span>
              <div><strong>{row.name}</strong><small>{row.role}</small></div>
            </div>
          ))}
        </section>
      </div>

      <div className="split">
        <section className="panel">
          <h2 style={{ marginBottom: 12 }}>Orders and cases</h2>
          {accountOrders.length + accountCases.length === 0 ? <p className="empty">No orders or cases yet.</p> : (
            <div className="stack">
              {accountOrders.map((row) => (
                <div className="line" key={String(row.id)}>
                  <strong>{String(row.id)}</strong>
                  <span>{money(row.amount)}</span>
                  <span className={`pill ${tone(row.status)}`}>{String(row.status)}</span>
                </div>
              ))}
              {accountCases.map((row) => (
                <div className="line" key={String(row.id)}>
                  <strong>{String(row.kind)}</strong>
                  <span>Case</span>
                  <span className={`pill ${tone(row.status)}`}>{String(row.status)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="panel">
          <h2 style={{ marginBottom: 14 }}>Activity</h2>
          {notes.length === 0 ? <p className="empty">Nothing logged yet.</p> : (
            <ul className="timeline">
              {notes.map((row) => (
                <li key={String(row.id)}>
                  {String(row.text)}
                  {row.at ? <small>{new Date(String(row.at)).toLocaleString()}</small> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}
