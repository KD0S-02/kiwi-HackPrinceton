import { ActionButton } from "../../../components/ActionButton";
import { ExportLink } from "../../../components/ExportLink";
import { loadNames, money, readRecords, tone } from "../../../lib/data";

export const dynamic = "force-dynamic";

export default async function SupplyPage() {
  const [warehouses, inventory, products, suppliers, purchaseOrders, priceBooks, nameOf] = await Promise.all([
    readRecords("warehouses.json"),
    readRecords("inventory.json"),
    readRecords("products.json"),
    readRecords("suppliers.json"),
    readRecords("purchase-orders.json"),
    readRecords("price-books.json"),
    loadNames(),
  ]);
  const productById = new Map(products.map((product) => [String(product.id), product]));
  const thin = [...inventory].sort((a, b) => Number(a.onHand) - Number(b.onHand)).slice(0, 10);
  const fryer = inventory.find((row) => row.productId === "fryer-oil");
  const openPos = purchaseOrders.filter((row) => row.status === "open");
  const units = inventory.reduce((sum, row) => sum + Number(row.onHand), 0);

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Supply</h1>
          <p>Fryer oil is at {nameOf(fryer?.warehouseId)} with {fryer?.onHand ?? "—"} on hand.</p>
        </div>
        <div className="actions">
          <ExportLink name="inventory" label="Export stock" />
          <ActionButton
            icon="tick"
            label="Cycle count"
            title="Cycle count"
            description="Enter what you counted on the shelf. It replaces the on-hand number."
            endpoint="/api/records/inventory/{id}"
            method="PATCH"
            success="Count saved."
            fields={[
              { name: "id", label: "Stock line", type: "select", options: inventory.map((row) => ({ value: String(row.id), label: `${String(productById.get(String(row.productId))?.name)} · ${nameOf(row.warehouseId)} (${row.onHand})` })) },
              { name: "onHand", label: "Counted", type: "number", required: true },
            ]}
          />
          <ActionButton
            variant="primary"
            icon="plus"
            label="New purchase order"
            title="New purchase order"
            endpoint="/api/records/purchase-orders"
            submit="Create purchase order"
            fields={[
              { name: "supplierId", label: "Supplier", type: "select", required: true, options: suppliers.map((row) => ({ value: String(row.id), label: String(row.name) })) },
              { name: "warehouseId", label: "Deliver to", type: "select", options: warehouses.map((row) => ({ value: String(row.id), label: String(row.name) })) },
            ]}
          />
        </div>
      </div>

      <div className="stats">
        <article className="card stat"><span>Units on hand</span><strong>{units.toLocaleString()}</strong><em>across {warehouses.length} warehouses</em></article>
        <article className="card stat tone-indigo"><span>Products</span><strong>{products.length}</strong><em>{priceBooks.length} price books</em></article>
        <article className="card stat tone-amber"><span>Open purchase orders</span><strong>{openPos.length}</strong><em>{purchaseOrders.length} in total</em></article>
        <article className="card stat tone-red"><span>Thin stock</span><strong>{inventory.filter((row) => Number(row.onHand) < 30).length}</strong><em>under 30 units</em></article>
      </div>

      <div className="warehouses">
        {warehouses.map((warehouse) => {
          const rows = inventory.filter((row) => row.warehouseId === warehouse.id);
          const total = rows.reduce((sum, row) => sum + Number(row.onHand), 0);
          return (
            <article className="panel warehouse" key={String(warehouse.id)}>
              <div className="panel-label">{String(warehouse.kind)}</div>
              <h2>{String(warehouse.name)}</h2>
              <strong className="units">{total.toLocaleString()} units</strong>
              <small>{nameOf(warehouse.officeId)} · {rows.length} products</small>
              <div className="mini-bars">
                {rows.slice(0, 4).map((row) => (
                  <div key={String(row.id)}>
                    <span>{String(productById.get(String(row.productId))?.name)}</span>
                    <i className={Number(row.onHand) < 30 ? "low" : ""} style={{ width: `${Math.min(100, Number(row.onHand))}%` }} />
                    <em>{row.onHand}</em>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>

      <div className="split">
        <section className="panel">
          <div className="panel-head"><h2>Thinnest stock</h2><span>lowest 10</span></div>
          <div className="scroll short">
            <table>
              <thead><tr><th>Product</th><th>Warehouse</th><th className="num">On hand</th><th className="num">Price</th></tr></thead>
              <tbody>
                {thin.map((row) => {
                  const product = productById.get(String(row.productId));
                  return (
                    <tr key={String(row.id)}>
                      <td>{String(product?.name)}</td>
                      <td>{nameOf(row.warehouseId)}</td>
                      <td className="num"><span className={Number(row.onHand) < 30 ? "pill bad" : "pill"}>{row.onHand}</span></td>
                      <td className="num">{money(product?.price)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Purchase orders</h2><span>{suppliers.length} suppliers</span></div>
          <div className="chips">
            {priceBooks.map((book) => <span className="pill gray" key={String(book.id)}>{String(book.name)} price book</span>)}
          </div>
          <div className="scroll short">
            {purchaseOrders.map((row) => (
              <div className="line" key={String(row.id)}>
                <strong>{nameOf(row.supplierId)}</strong>
                <span>{nameOf(row.warehouseId)}</span>
                <span className={`pill ${tone(row.status)}`}>{String(row.status)}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
