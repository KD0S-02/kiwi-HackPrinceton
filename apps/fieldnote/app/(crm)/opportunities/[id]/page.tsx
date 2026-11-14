import { notFound } from "next/navigation";
import { ActionButton } from "../../../../components/ActionButton";
import { DeleteButton } from "../../../../components/DeleteButton";
import { Pill } from "../../../../components/RecordLink";
import { StatusPath } from "../../../../components/StatusPath";
import { Timeline } from "../../../../components/Timeline";
import { loadNames, money, prettyDate, round2, tone } from "../../../../lib/data";
import { signedInUser } from "../../../../lib/session";
import { activityFor } from "../../../../lib/workflow/activity";
import { preflight } from "../../../../lib/workflow/actions";
import { linesOf, priced } from "../../../../lib/workflow/actions/quotes";
import { find, num, openDb } from "../../../../lib/workflow/db";
import { linesTotal, quoteAmount, unitPriceFor } from "../../../../lib/workflow/money";
import { accountReason } from "../../../../lib/workflow/permissions";
import { freeForAccount } from "../../../../lib/workflow/stock";
import { approvalKind, approvalNumber } from "../../../../lib/workflow/view";
import { DiscountEditor } from "./discount-editor";

export const dynamic = "force-dynamic";

const stages = ["Qualify", "Proposal", "Commit", "Closed Won"];

export default async function OpportunityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab = "overview" } = await searchParams;
  const db = openDb();
  const opportunity = await find(db, "opportunities.json", id);
  if (!opportunity) notFound();
  const person = await signedInUser();
  const [employees, rules, products, activity, approvals, quotes, contacts, nameOf] = await Promise.all([
    db.rows("employees.json"),
    db.rules(),
    db.rows("products.json"),
    db.rows("activity.json"),
    db.rows("approvals.json"),
    db.rows("quotes.json"),
    db.rows("contacts.json"),
    loadNames(),
  ]);
  const account = await find(db, "accounts.json", opportunity.accountId);
  const owner = employees.find((row) => row.id === opportunity.ownerId);
  const discountPercent = num(opportunity.discountPercent);
  const approvedPercent = opportunity.approvedDiscountPercent != null && opportunity.approvedDiscountPercent !== "" ? num(opportunity.approvedDiscountPercent) : null;
  const ownerOk = opportunity.ownerId === person.id;
  const editBlocked = await accountReason(db, person, account);
  const items = await linesOf(db, id);
  const lines = await Promise.all(items.map(async (item) => {
    const product = products.find((row) => row.id === item.productId);
    const unitPrice = await priced(db, account, item);
    const free = await freeForAccount(db, account, String(item.productId));
    const substitutes = products.filter((row) => row.family === product?.family && row.id !== product?.id);
    const options = await Promise.all(substitutes.map(async (row) => ({ row, free: await freeForAccount(db, account, String(row.id)) })));
    const subBlocked = editBlocked || (options.every((option) => option.free.free < num(item.quantity)) ? `No ${product?.family} product has ${num(item.quantity)} free to substitute.` : "");
    return { item, product, unitPrice, free, options, subBlocked };
  }));
  const total = linesTotal(lines.map(({ item, unitPrice }) => ({ quantity: item.quantity, unitPrice })));
  const quoteTotal = quoteAmount(total, discountPercent);
  const sendBlocked = await preflight("send-quote", person, { opportunityId: id });
  const notes = activityFor(activity, "opportunity", id);
  const dealApprovals = approvals.filter((row) => row.opportunityId === id || (row.subjectType === "opportunity" && row.subjectId === id));
  const versions = quotes.filter((row) => row.opportunityId === id).sort((a, b) => num(b.version || 1) - num(a.version || 1));
  const stageIndex = stages.indexOf(String(opportunity.stage));
  const owners = employees.filter((row) => row.role === "account executive" || row.role === "manager");
  const catalog = await Promise.all(products.map(async (row) => ({ row, price: await unitPriceFor(db, account, String(row.id)), free: await freeForAccount(db, account, String(row.id)) })));
  const buyer = contacts.find((row) => row.accountId === opportunity.accountId && row.role === "buyer");
  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "products", label: "Products", count: items.length },
    { key: "quotes", label: "Quotes", count: versions.length },
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
              <p>Opportunity · {money(opportunity.amount)} forecast · {String(opportunity.stage)}{account?.creditHold === "yes" ? " · account on credit hold" : ""}</p>
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
          {editBlocked ? null : <DeleteButton endpoint={`/api/records/opportunities/${id}`} name={String(opportunity.name)} redirect="/pipeline" />}
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
        <div className="highlight"><span>Amount</span><strong id="amount">{money(opportunity.amount)}</strong>{items.length ? <small className="sub">Lines {money(total)} · quote {money(quoteTotal)}</small> : <small className="sub">forecast</small>}</div>
        <DiscountEditor opportunityId={id} discountPercent={discountPercent} blocked={sendBlocked} cap={rules.discountCapPercent} approvedPercent={approvedPercent} canEdit={!editBlocked} />
      </div>

      <nav className="tabs">
        {tabs.map((item) => (
          <a key={item.key} id={`tab-${item.key}`} data-kiwi={`tab-${item.key}`} className={tab === item.key ? "active" : ""} href={`/opportunities/${id}?tab=${item.key}`}>
            {item.label}{item.count ? <small>{item.count}</small> : null}
          </a>
        ))}
      </nav>

      {tab === "overview" && (
        <div className="split">
          <section className="panel">
            <h2 style={{ marginBottom: 8 }}>Deal details</h2>
            <dl className="facts">
              <dt>Restaurant</dt><dd><a href={`/accounts/${opportunity.accountId}`}>{String(account?.name ?? "—")}</a></dd>
              <dt>Buyer</dt><dd>{String(buyer?.name ?? account?.buyerName ?? "—")}</dd>
              <dt>Usual order</dt><dd>{String(account?.usualOrder ?? "—")}</dd>
              <dt>Territory</dt><dd>{nameOf(account?.territoryId)}</dd>
              <dt>Price book</dt><dd>{nameOf(account?.priceBookId)}</dd>
              <dt>Warehouse</dt><dd>{nameOf(account?.warehouseId)}</dd>
              {person.managerName ? <><dt>Your manager</dt><dd>{person.managerName}</dd></> : null}
              <dt>Discount approver</dt><dd>{person.approverName || "You"}</dd>
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
                hidden={{ opportunityId: id, accountId: String(opportunity.accountId), subjectType: "opportunity", subjectId: id }}
                fields={[{ name: "text", label: "Note", type: "textarea", required: true }]}
              />
            </div>
            <div className="next-steps">
              {!ownerOk ? <div className="step alert">Only {String(owner?.name)} can send this quote.</div> : sendBlocked ? <div className="step alert">{sendBlocked}</div> : <div className="step">Everything checks out. Send the quote when the buyer is ready.</div>}
              {items.length === 0 ? <div className="step">Add products on the Products tab. The quote is built from those lines.</div> : null}
              {versions[0] ? <div className="step">Latest quote: <a href={`/quotes/${versions[0].id}`}>version {String(versions[0].version || 1)}</a> · <Pill value={versions[0].status} /></div> : null}
            </div>
            <div style={{ marginTop: 18 }}>
              <Timeline entries={notes} nameOf={nameOf} limit={3} empty="" />
            </div>
          </section>
        </div>
      )}

      {tab === "products" && (
        <section className="panel" data-kiwi="results">
          <div className="panel-head">
            <h2>Products</h2>
            <span>{account?.priceBookId === "northeast" ? "Northeast price book" : "Standard prices"} · free stock at the warehouses serving {String(account?.name)}</span>
            <ActionButton
              small
              kiwi="add-product"
              icon="plus"
              label="Add product"
              title="Add product"
              description="Prices come from the account's price book. Free stock is what can still be promised."
              endpoint="/api/records/line-items"
              hidden={{ opportunityId: id }}
              blocked={editBlocked}
              why="title"
              fields={[
                { name: "productId", label: "Product", type: "select", required: true, options: catalog.map(({ row, price, free }) => ({ value: String(row.id), label: `${String(row.name)} · ${money(price)} · ${free.free} free` })) },
                { name: "quantity", label: "Quantity", type: "number", value: "1", required: true, min: 1 },
              ]}
            />
          </div>
          <table>
            <thead><tr><th>Product</th><th>SKU</th><th className="num">Unit price</th><th className="num">Quantity</th><th className="num">Line total</th><th>Stock</th><th></th></tr></thead>
            <tbody>
              {lines.length === 0 ? <tr><td colSpan={7} className="empty">No products on this opportunity.</td></tr> : lines.map(({ item, product, unitPrice, free, options, subBlocked }) => {
                const short = free.free < num(item.quantity);
                return (
                  <tr key={String(item.id)}>
                    <td><strong>{String(product?.name ?? item.productId)}</strong>{item.substituteFor ? <small className="sub">substitute for {nameOf(item.substituteFor)}</small> : null}{short ? <small className="sub warn-text">Only {free.free} free at {free.warehouseName}.</small> : null}</td>
                    <td>{String(product?.sku ?? "")}</td>
                    <td className="num">{money(unitPrice)}</td>
                    <td className="num">{num(item.quantity)}</td>
                    <td className="num">{money(round2(unitPrice * num(item.quantity)))}</td>
                    <td><span className={`pill ${short ? "bad" : "good"}`} data-kiwi={`stock-${item.productId}`}>{free.free} free</span></td>
                    <td>
                      <div className="row-actions">
                        <ActionButton
                          small
                          kiwi={`substitute-${item.productId}`}
                          icon="copy"
                          label="Substitute"
                          title={`Substitute ${String(product?.name)}`}
                          description="Same family only, and the buyer has to agree (substitution policy)."
                          action="substitute-line"
                          hidden={{ lineItemId: String(item.id) }}
                          submit="Substitute"
                          blocked={subBlocked}
                          why="title"
                          fields={[
                            { name: "productId", label: "Substitute with", type: "select", options: options.sort((a, b) => b.free.free - a.free.free).map(({ row, free: stock }) => ({ value: String(row.id), label: `${String(row.name)} · ${stock.free} free` })) },
                            { name: "buyerAgreed", label: "Did the buyer agree?", type: "select", value: "", options: [{ value: "", label: "Not yet" }, { value: "yes", label: "Yes, the buyer agreed" }] },
                          ]}
                        />
                        <ActionButton
                          small
                          icon="edit"
                          label="Edit"
                          kiwi={`edit-line-${item.productId}`}
                          title={`Edit ${String(product?.name)}`}
                          description="A sent quote keeps its own copy of the lines. Send again to make a new version."
                          endpoint={`/api/records/line-items/${item.id}`}
                          method="PATCH"
                          blocked={editBlocked}
                          why="title"
                          fields={[{ name: "quantity", label: "Quantity", type: "number", value: String(item.quantity), required: true, min: 1 }]}
                        />
                        {editBlocked ? null : <DeleteButton small endpoint={`/api/records/line-items/${item.id}`} name={String(product?.name ?? "line")} />}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {lines.length > 0 ? (
              <tfoot>
                <tr><td colSpan={4}>Lines total</td><td className="num">{money(total)}</td><td colSpan={2}></td></tr>
                <tr><td colSpan={4}>Quote at {discountPercent}% discount</td><td className="num"><strong>{money(quoteTotal)}</strong></td><td colSpan={2}></td></tr>
              </tfoot>
            ) : null}
          </table>
        </section>
      )}

      {tab === "quotes" && (
        <section className="panel">
          <div className="panel-head"><h2>Quote versions</h2><span>Each send makes a new version. The newest replaces the ones before it.</span></div>
          <table>
            <thead><tr><th>Version</th><th>Status</th><th>Sent to</th><th>Sent</th><th>Valid until</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {versions.length === 0 ? <tr><td colSpan={6} className="empty">No quotes sent yet.</td></tr> : versions.map((row) => (
                <tr key={String(row.id)}>
                  <td><a href={`/quotes/${row.id}`}>Version {String(row.version || 1)}</a></td>
                  <td><span className={`pill ${tone(row.status)}`}>{String(row.status)}</span></td>
                  <td>{nameOf(row.sentTo)}</td>
                  <td>{prettyDate(row.sentAt)}</td>
                  <td>{prettyDate(row.validUntil)}</td>
                  <td className="num">{money(row.amount)}</td>
                </tr>
              ))}
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
              hidden={{ opportunityId: id, accountId: String(opportunity.accountId), subjectType: "opportunity", subjectId: id }}
              fields={[{ name: "text", label: "Note", type: "textarea", required: true }]}
            />
          </div>
          <Timeline entries={notes} nameOf={nameOf} />
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
              kiwi="request-approval"
              label="Request approval"
              title="Request approval"
              description={person.approverName ? `${person.approverName} gets the request for ${discountPercent}%.` : "You approve this yourself."}
              endpoint="/api/records/approvals"
              hidden={{ opportunityId: id }}
              blocked={editBlocked}
              why="title"
              fields={[
                { name: "kind", label: "What needs approval", type: "select", options: [{ value: "discount", label: `Discount of ${discountPercent}%` }, { value: "pricing exception", label: "Pricing exception" }] },
                { name: "note", label: "Why", type: "textarea", placeholder: "Matching a competitor's price on the standing order." },
              ]}
            />
          </div>
          <table>
            <thead><tr><th>Request</th><th>Kind</th><th className="num">Discount</th><th>Requested by</th><th>Approver</th><th>Status</th></tr></thead>
            <tbody>
              {dealApprovals.length === 0 ? <tr><td colSpan={6} className="empty">No approvals on this deal.</td></tr> : dealApprovals.map((row) => (
                <tr key={String(row.id)}>
                  <td><a href={`/approvals/${row.id}`}>{approvalNumber(row.id)}</a></td>
                  <td>{approvalKind(row.kind)}</td>
                  <td className="num">{row.amount != null ? `${num(row.amount)}%` : "—"}</td>
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
