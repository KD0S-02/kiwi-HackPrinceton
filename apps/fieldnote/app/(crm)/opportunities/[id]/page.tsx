import { notFound } from "next/navigation";
import { ActionButton } from "../../../../components/ActionButton";
import { DeleteButton } from "../../../../components/DeleteButton";
import { money, prettyDate, round2, tone } from "../../../../lib/data";
import { signedInUser } from "../../../../lib/session";
import { preflight } from "../../../../lib/workflow/actions";
import { linesOf, priced } from "../../../../lib/workflow/actions/quotes";
import { find, num, openDb } from "../../../../lib/workflow/db";
import { linesTotal, quoteAmount, unitPriceFor } from "../../../../lib/workflow/money";
import { accountReason } from "../../../../lib/workflow/permissions";
import { freeForAccount } from "../../../../lib/workflow/stock";
import { DiscountEditor } from "./discount-editor";

export const dynamic = "force-dynamic";

// The deal page is the quote: products, a discount, send, then the quotes that send created.
export default async function OpportunityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab = "products" } = await searchParams;
  const db = openDb();
  const opportunity = await find(db, "opportunities.json", id);
  if (!opportunity) notFound();
  const person = await signedInUser();
  const [rules, products, quotes] = await Promise.all([db.rules(), db.rows("products.json"), db.rows("quotes.json")]);
  const account = await find(db, "accounts.json", opportunity.accountId);
  const discountPercent = num(opportunity.discountPercent);
  const approvedPercent = opportunity.approvedDiscountPercent != null && opportunity.approvedDiscountPercent !== "" ? num(opportunity.approvedDiscountPercent) : null;
  const editBlocked = await accountReason(db, person, account);
  const items = await linesOf(db, id);
  const lines = await Promise.all(items.map(async (item) => {
    const product = products.find((row) => row.id === item.productId);
    const unitPrice = await priced(db, account, item);
    const free = await freeForAccount(db, account, String(item.productId));
    return { item, product, unitPrice, free };
  }));
  const total = linesTotal(lines.map(({ item, unitPrice }) => ({ quantity: item.quantity, unitPrice })));
  const quoteTotal = quoteAmount(total, discountPercent);
  const sendBlocked = await preflight("send-quote", person, { opportunityId: id });
  const versions = quotes.filter((row) => row.opportunityId === id).sort((a, b) => num(b.version || 1) - num(a.version || 1));
  const catalog = await Promise.all(products.map(async (row) => ({ row, price: await unitPriceFor(db, account, String(row.id)), free: await freeForAccount(db, account, String(row.id)) })));
  const names = lines.map(({ product, item }) => String(product?.name ?? item.productId));
  const showing = tab === "quotes" ? "quotes" : "products";
  const tabs = [
    { key: "products", label: "Products", count: items.length },
    { key: "quotes", label: "Quotes", count: versions.length },
  ];

  return (
    <section>
      <div className="page-head">
        <div>
          <div className="crumb"><a href="/pipeline">Pipeline</a> / {String(account?.name ?? opportunity.name)}</div>
          <h1>{String(account?.name ?? opportunity.name)}</h1>
          <p id="stage">{String(opportunity.stage)}{account?.creditHold === "yes" ? " · account on credit hold" : ""}</p>
        </div>
      </div>

      <div className="quote-bar">
        <DiscountEditor opportunityId={id} discountPercent={discountPercent} blocked={sendBlocked} cap={rules.discountCapPercent} approvedPercent={approvedPercent} canEdit={!editBlocked} />
        <div className="highlight">
          <span>Quote</span>
          <strong id="amount">{money(quoteTotal)}</strong>
          <small className="sub" data-kiwi-fact="lines">{names.length ? names.join(", ") : "No products yet"}</small>
          <small className="sub" data-kiwi-fact="latest-quote">{versions[0]?.status === "sent" ? "Quote sent" : "Not sent yet"}</small>
        </div>
      </div>

      <nav className="tabs">
        {tabs.map((item) => (
          <a key={item.key} id={`tab-${item.key}`} data-kiwi={`tab-${item.key}`} className={showing === item.key ? "active" : ""} href={`/opportunities/${id}?tab=${item.key}`}>
            {item.label}{item.count ? <small>{item.count}</small> : null}
          </a>
        ))}
      </nav>

      {showing === "products" && (
        <section className="panel" data-kiwi="results">
          <div className="panel-head">
            <h2>Products</h2>
            <span>{account?.priceBookId === "northeast" ? "Northeast price book" : "Standard prices"}</span>
            <ActionButton
              small
              kiwi="add-product"
              icon="plus"
              label="Add product"
              title="Add product"
              description="The price comes from the restaurant's price book."
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
            <thead><tr><th>Product</th><th className="num">Unit price</th><th className="num">Quantity</th><th className="num">Line total</th><th>Stock</th><th></th></tr></thead>
            <tbody>
              {lines.length === 0 ? <tr><td colSpan={6} className="empty">No products yet.</td></tr> : lines.map(({ item, product, unitPrice, free }) => {
                const short = free.free < num(item.quantity);
                return (
                  <tr key={String(item.id)}>
                    <td>
                      <strong>{String(product?.name ?? item.productId)}</strong>
                      {short ? <small className="sub warn-text">Only {free.free} free at {free.warehouseName}.</small> : null}
                    </td>
                    <td className="num">{money(unitPrice)}</td>
                    <td className="num">{num(item.quantity)}</td>
                    <td className="num">{money(round2(unitPrice * num(item.quantity)))}</td>
                    <td><span className={`pill ${short ? "bad" : "good"}`}>{free.free} free</span></td>
                    <td>{editBlocked ? null : <DeleteButton small endpoint={`/api/records/line-items/${item.id}`} name={String(product?.name ?? "line")} />}</td>
                  </tr>
                );
              })}
            </tbody>
            {lines.length > 0 ? (
              <tfoot>
                <tr><td colSpan={3}>Lines total</td><td className="num">{money(total)}</td><td colSpan={2}></td></tr>
                <tr><td colSpan={3}>Quote at {discountPercent}%</td><td className="num"><strong>{money(quoteTotal)}</strong></td><td colSpan={2}></td></tr>
              </tfoot>
            ) : null}
          </table>
        </section>
      )}

      {showing === "quotes" && (
        <section className="panel" data-kiwi="results">
          <div className="panel-head"><h2>Quotes</h2><span>Each send makes a new version. The newest replaces the ones before it.</span></div>
          <table>
            <thead><tr><th>Version</th><th>Status</th><th>Sent</th><th className="num">Amount</th></tr></thead>
            <tbody>
              {versions.length === 0 ? <tr><td colSpan={4} className="empty">No quotes sent yet.</td></tr> : versions.map((row) => (
                <tr key={String(row.id)}>
                  <td><a href={`/quotes/${row.id}`}>Version {String(row.version || 1)}</a></td>
                  <td><span className={`pill ${tone(row.status)}`}>{String(row.status)}</span></td>
                  <td>{prettyDate(row.sentAt)}</td>
                  <td className="num">{money(row.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </section>
  );
}
