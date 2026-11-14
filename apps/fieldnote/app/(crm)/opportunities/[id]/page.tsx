import { notFound } from "next/navigation";
import { ActionButton } from "../../../../components/ActionButton";
import { DeleteButton } from "../../../../components/DeleteButton";
import { loadNames, money, readRecords, readRules, tone } from "../../../../lib/data";
import { DiscountEditor } from "./discount-editor";

export const dynamic = "force-dynamic";

const stages = ["Qualify", "Proposal", "Commit", "Closed"];

export default async function OpportunityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab = "overview" } = await searchParams;
  const [opportunities, accounts, employees, rules, lineItems, products, activity, approvals, nameOf] = await Promise.all([
    readRecords("opportunities.json"),
    readRecords("accounts.json"),
    readRecords("employees.json"),
    readRules(),
    readRecords("line-items.json"),
    readRecords("products.json"),
    readRecords("activity.json"),
    readRecords("approvals.json"),
    loadNames(),
  ]);
  const opportunity = opportunities.find((row) => row.id === id);
  if (!opportunity) notFound();
  const account = accounts.find((row) => row.id === opportunity.accountId);
  const owner = employees.find((row) => row.id === opportunity.ownerId);
  const discountPercent = Number(opportunity.discountPercent);
  const ownerOk = opportunity.ownerId === "user";
  const withinCap = discountPercent <= rules.discountCapPercent;
  const items = lineItems.filter((row) => row.opportunityId === id);
  const notes = activity.filter((row) => row.opportunityId === id).reverse();
  const dealApprovals = approvals.filter((row) => row.opportunityId === id);
  const stageIndex = stages.indexOf(String(opportunity.stage));
  const owners = employees.filter((row) => row.role === "account executive" || row.role === "manager");
  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "products", label: "Products", count: items.length },
    { key: "activity", label: "Activity", count: notes.length },
    { key: "approvals", label: "Approvals", count: dealApprovals.length },
  ];

  return (
    <section>
      <div className="page-head">
        <div>
          <div className="crumb"><a href="/pipeline">Pipeline</a> / {String(account?.name ?? opportunity.name)}</div>
          <div className="record-title">
            <div>
              <h1>{String(account?.name ?? opportunity.name)}</h1>
              <p>Opportunity · {money(opportunity.amount)} · {String(opportunity.stage)}</p>
            </div>
          </div>
        </div>
        <div className="actions">
          <ActionButton
            icon="copy"
            label="Clone"
            title="Clone opportunity"
            description="The copy starts at 0 percent discount."
            endpoint="/api/records/opportunities"
            redirect="/opportunities/{id}"
            submit="Create copy"
            hidden={{ accountId: String(opportunity.accountId), amount: Number(opportunity.amount), stage: "Qualify" }}
            fields={[{ name: "name", label: "Name", value: `${String(opportunity.name)} copy`, required: true }]}
          />
          <ActionButton
            icon="user"
            label="Change owner"
            title="Change owner"
            description="Only the owner can send the quote."
            endpoint={`/api/records/opportunities/${id}`}
            method="PATCH"
            fields={[{ name: "ownerId", label: "New owner", type: "select", value: String(opportunity.ownerId), options: owners.map((row) => ({ value: String(row.id), label: `${String(row.name)} · ${String(row.role)}` })) }]}
          />
          <a className="btn ghost" href={`/accounts/${opportunity.accountId}`}>View account</a>
          <DeleteButton endpoint={`/api/records/opportunities/${id}`} name={String(opportunity.name)} redirect="/pipeline" />
        </div>
      </div>

      <div className="path" aria-label="Stage">
        {stages.map((name, index) => (
          <span key={name} className={index < stageIndex ? "done" : index === stageIndex ? "now" : ""}>{name}</span>
        ))}
      </div>

      <div className="highlights">
        <div className="highlight"><span>Owner</span><strong>{String(owner?.name ?? "—")}</strong></div>
        <div className="highlight"><span>Stage</span><strong id="stage">{String(opportunity.stage)}</strong></div>
        <div className="highlight"><span>Amount</span><strong id="amount">{money(opportunity.amount)}</strong></div>
        <DiscountEditor opportunityId={id} discountPercent={discountPercent} sendAllowed={withinCap} ownerOk={ownerOk} cap={rules.discountCapPercent} />
      </div>

      <nav className="tabs">
        {tabs.map((item) => (
          <a key={item.key} className={tab === item.key ? "active" : ""} href={`/opportunities/${id}?tab=${item.key}`}>
            {item.label}{item.count ? <small>{item.count}</small> : null}
          </a>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="split">
          <section className="panel">
            <h2 style={{ marginBottom: 8 }}>Deal details</h2>
            <dl className="facts">
              <dt>Restaurant</dt><dd>{String(account?.name ?? "—")}</dd>
              <dt>Buyer</dt><dd>{String(account?.buyerName ?? "—")}</dd>
              <dt>Usual order</dt><dd>{String(account?.usualOrder ?? "—")}</dd>
              <dt>Territory</dt><dd>{nameOf(account?.territoryId)}</dd>
              <dt>Warehouse</dt><dd>{nameOf(account?.warehouseId)}</dd>
              <dt>Manager</dt><dd>Alex Morgan (your manager)</dd>
            </dl>
          </section>
          <section className="panel">
            <div className="panel-head">
              <h2>Next steps</h2>
              <ActionButton
                small
                icon="note"
                label="Log activity"
                title="Log activity"
                endpoint="/api/records/activity"
                hidden={{ opportunityId: id, accountId: String(opportunity.accountId) }}
                fields={[{ name: "text", label: "Note", type: "textarea", required: true }]}
              />
            </div>
            <div className="next-steps">
              {!ownerOk ? <div className="step alert">Only {String(owner?.name)} can send this quote.</div> : withinCap ? <div className="step">The discount is within the cap. Send the quote when the buyer is ready.</div> : <div className="step alert">Bring the discount to {rules.discountCapPercent} percent or under, or ask your manager, Alex Morgan, to approve it.</div>}
            </div>
            {notes.length > 0 ? (
              <ul className="timeline" style={{ marginTop: 18 }}>
                {notes.slice(0, 3).map((row) => <li key={String(row.id)}>{String(row.text)}</li>)}
              </ul>
            ) : null}
          </section>
        </div>
      )}

      {tab === "products" && (
        <section className="panel">
          <div className="panel-head">
            <h2>Products</h2>
            <ActionButton
              small
              icon="plus"
              label="Add product"
              title="Add product"
              endpoint="/api/records/line-items"
              hidden={{ opportunityId: id }}
              fields={[
                { name: "productId", label: "Product", type: "select", required: true, options: products.map((row) => ({ value: String(row.id), label: `${String(row.name)} · ${money(row.price)}` })) },
                { name: "quantity", label: "Quantity", type: "number", value: "1", required: true },
              ]}
            />
          </div>
          <table>
            <thead><tr><th>Product</th><th>SKU</th><th className="num">Unit price</th><th className="num">Quantity</th><th></th></tr></thead>
            <tbody>
              {items.length === 0 ? <tr><td colSpan={5} className="empty">No products on this opportunity.</td></tr> : items.map((item) => {
                const product = products.find((row) => row.id === item.productId);
                return (
                  <tr key={String(item.id)}>
                    <td>{String(product?.name ?? item.productId)}</td>
                    <td>{String(product?.sku ?? "")}</td>
                    <td className="num">{money(product?.price)}</td>
                    <td className="num">{item.quantity}</td>
                    <td className="num">
                      <ActionButton
                        small
                        icon="edit"
                        label="Edit line"
                        title={`Edit ${String(product?.name)}`}
                        endpoint={`/api/records/line-items/${item.id}`}
                        method="PATCH"
                        fields={[{ name: "quantity", label: "Quantity", type: "number", value: String(item.quantity), required: true }]}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {tab === "activity" && (
        <section className="panel">
          <div className="panel-head">
            <h2>Activity</h2>
            <ActionButton
              small
              icon="note"
              label="Log activity"
              title="Log activity"
              endpoint="/api/records/activity"
              hidden={{ opportunityId: id, accountId: String(opportunity.accountId) }}
              fields={[{ name: "text", label: "Note", type: "textarea", required: true }]}
            />
          </div>
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
      )}

      {tab === "approvals" && (
        <section className="panel">
          <div className="panel-head">
            <h2>Approvals</h2>
            <ActionButton
              small
              variant="primary"
              icon="check"
              label="Request approval"
              title="Request approval"
              description="Your manager, Alex Morgan, gets the request."
              endpoint="/api/records/approvals"
              hidden={{ opportunityId: id }}
              success="Request sent to Alex Morgan."
              fields={[{ name: "kind", label: "What needs approval", type: "select", options: [{ value: "discount", label: "Discount over the cap" }, { value: "pricing exception", label: "Pricing exception" }] }]}
            />
          </div>
          <table>
            <thead><tr><th>Kind</th><th>Requested by</th><th>Approver</th><th>Status</th></tr></thead>
            <tbody>
              {dealApprovals.length === 0 ? <tr><td colSpan={4} className="empty">No approvals on this deal.</td></tr> : dealApprovals.map((row) => (
                <tr key={String(row.id)}>
                  <td>{String(row.kind)}</td>
                  <td>{nameOf(row.requestedBy)}</td>
                  <td>{nameOf(row.approverId)}</td>
                  <td><span className={`pill ${tone(row.status)}`}>{String(row.status)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </section>
  );
}
