import { ActionButton } from "../../../components/ActionButton";
import { DeleteButton } from "../../../components/DeleteButton";
import { ExportLink } from "../../../components/ExportLink";
import { FilterBar } from "../../../components/FilterBar";
import { loadNames, money, readRecords, tone } from "../../../lib/data";
import { textMatches } from "../../../lib/filters";
import { loadFilters } from "../../../lib/page-filters";

export const dynamic = "force-dynamic";

const lowStock = 30;

export default async function SupplyPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { filters, values } = await loadFilters("/supply", await searchParams);
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
  const fryer = inventory.find((row) => row.productId === "fryer-oil");
  const openPos = purchaseOrders.filter((row) => row.status === "open");
  const units = inventory.reduce((sum, row) => sum + Number(row.onHand), 0);
  const stock = inventory
    .filter((row) => {
      const product = productById.get(String(row.productId));
      return (!values.warehouse || row.warehouseId === values.warehouse)
        && (!values.family || product?.family === values.family)
        && (values.stock !== "low" || Number(row.onHand) < lowStock)
        && (values.stock !== "ok" || Number(row.onHand) >= lowStock)
        && textMatches(values.q, [product?.name, product?.sku, product?.family]);
    })
    .sort((a, b) => Number(a.onHand) - Number(b.onHand));
  const warehouseOptions = warehouses.map((row) => ({ value: String(row.id), label: String(row.name) }));
  const supplierOptions = suppliers.map((row) => ({ value: String(row.id), label: String(row.name) }));
  const orders = purchaseOrders.filter((row) => !values.warehouse || row.warehouseId === values.warehouse);

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
              { name: "supplierId", label: "Supplier", type: "select", required: true, options: supplierOptions },
              { name: "warehouseId", label: "Deliver to", type: "select", options: warehouseOptions },
            ]}
          />
        </div>
      </div>

      <div className="stats">
        <article className="card stat"><span>Units on hand</span><strong>{units.toLocaleString()}</strong><em>across {warehouses.length} warehouses</em></article>
        <article className="card stat tone-indigo"><span>Products</span><strong>{products.length}</strong><em>{priceBooks.length} price books</em></article>
        <article className="card stat tone-amber"><span>Open purchase orders</span><strong>{openPos.length}</strong><em>{purchaseOrders.length} in total</em></article>
        <article className="card stat tone-red"><span>Thin stock</span><strong>{inventory.filter((row) => Number(row.onHand) < lowStock).length}</strong><em>under {lowStock} units</em></article>
      </div>

      <div className="warehouses">
        {warehouses.map((warehouse) => {
          const rows = inventory.filter((row) => row.warehouseId === warehouse.id);
          const total = rows.reduce((sum, row) => sum + Number(row.onHand), 0);
          const selected = values.warehouse === warehouse.id;
          return (
            <a className={`panel warehouse${selected ? " selected" : ""}`} key={String(warehouse.id)} href={selected ? "/supply" : `/supply?warehouse=${warehouse.id}`}>
              <div className="panel-label">{String(warehouse.kind)}</div>
              <h2>{String(warehouse.name)}</h2>
              <strong className="units">{total.toLocaleString()} units</strong>
              <small>{nameOf(warehouse.officeId)} · {rows.length} products</small>
              <div className="mini-bars">
                {rows.slice(0, 4).map((row) => (
                  <div key={String(row.id)}>
                    <span>{String(productById.get(String(row.productId))?.name)}</span>
                    <i className={Number(row.onHand) < lowStock ? "low" : ""} style={{ width: `${Math.min(100, Number(row.onHand))}%` }} />
                    <em>{row.onHand}</em>
                  </div>
                ))}
              </div>
            </a>
          );
        })}
      </div>

      <section className="panel" data-kiwi="results">
        <div className="panel-head"><h2>Stock</h2><span>lowest first</span></div>
        <FilterBar path="/supply" filters={filters} values={values} shown={stock.length} total={inventory.length} noun="stock lines" />
        <div className="scroll tall">
          <table>
            <thead><tr><th>Product</th><th>SKU</th><th>Family</th><th>Warehouse</th><th className="num">On hand</th><th className="num">Price</th><th></th></tr></thead>
            <tbody>
              {stock.length === 0 ? <tr><td colSpan={7} className="empty">No stock matches those filters.</td></tr> : stock.map((row) => {
                const product = productById.get(String(row.productId));
                return (
                  <tr key={String(row.id)}>
                    <td>{String(product?.name)}</td>
                    <td>{String(product?.sku ?? "")}</td>
                    <td>{String(product?.family ?? "")}</td>
                    <td>{nameOf(row.warehouseId)}</td>
                    <td className="num"><span className={Number(row.onHand) < lowStock ? "pill bad" : "pill"}>{row.onHand}</span></td>
                    <td className="num">{money(product?.price)}</td>
                    <td>
                      <div className="row-actions">
                        <ActionButton
                          small
                          icon="tick"
                          label="Count"
                          title={`Count ${String(product?.name)} at ${nameOf(row.warehouseId)}`}
                          endpoint={`/api/records/inventory/${row.id}`}
                          method="PATCH"
                          success="Count saved."
                          fields={[{ name: "onHand", label: "Counted", type: "number", value: String(row.onHand), required: true }]}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Purchase orders</h2><span><a href="/products">Products</a> · <a href="/suppliers">Suppliers</a> · <a href="/purchase-orders">All POs →</a></span></div>
        <div className="chips">
          {priceBooks.map((book) => <span className="pill gray" key={String(book.id)}>{String(book.name)} price book</span>)}
        </div>
        <div className="scroll short">
          <table>
            <thead><tr><th>PO</th><th>Supplier</th><th>Deliver to</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {orders.length === 0 ? <tr><td colSpan={5} className="empty">No purchase orders here.</td></tr> : orders.map((row) => (
                <tr key={String(row.id)}>
                  <td>{String(row.id)}</td>
                  <td>{nameOf(row.supplierId)}</td>
                  <td>{nameOf(row.warehouseId)}</td>
                  <td><span className={`pill ${tone(row.status)}`}>{String(row.status)}</span></td>
                  <td>
                    <div className="row-actions">
                      <ActionButton
                        small
                        icon="edit"
                        label="Edit"
                        title={`Edit ${String(row.id)}`}
                        endpoint={`/api/records/purchase-orders/${row.id}`}
                        method="PATCH"
                        fields={[
                          { name: "status", label: "Status", type: "select", value: String(row.status), options: [{ value: "open", label: "Open" }, { value: "received", label: "Received" }] },
                          { name: "warehouseId", label: "Deliver to", type: "select", value: String(row.warehouseId), options: warehouseOptions },
                        ]}
                      />
                      <DeleteButton small endpoint={`/api/records/purchase-orders/${row.id}`} name={String(row.id)} />
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
