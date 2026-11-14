import { ActionButton } from "../../../components/ActionButton";
import { ExportLink } from "../../../components/ExportLink";
import { FilterBar } from "../../../components/FilterBar";
import { Pill } from "../../../components/RecordLink";
import { loadNames, money, prettyDate } from "../../../lib/data";
import { textMatches } from "../../../lib/filters";
import { loadFilters } from "../../../lib/page-filters";
import { signedInUser } from "../../../lib/session";
import { preflight } from "../../../lib/workflow/actions";
import { poStatus, suggestedQuantity } from "../../../lib/workflow/actions/purchasing";
import { num, openDb } from "../../../lib/workflow/db";
import { opsCheck } from "../../../lib/workflow/permissions";
import { backorderedStock, freeStock } from "../../../lib/workflow/stock";

export const dynamic = "force-dynamic";

const lowStock = 30;

export default async function SupplyPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { filters, values } = await loadFilters("/supply", await searchParams);
  const db = openDb();
  const person = await signedInUser();
  const [warehouses, inventory, products, suppliers, purchaseOrders, priceBooks, nameOf] = await Promise.all([
    db.rows("warehouses.json"),
    db.rows("inventory.json"),
    db.rows("products.json"),
    db.rows("suppliers.json"),
    db.rows("purchase-orders.json"),
    db.rows("price-books.json"),
    loadNames(),
  ]);
  const productById = new Map(products.map((product) => [String(product.id), product]));
  const levels = await Promise.all(inventory.map(async (row) => {
    const productId = String(row.productId);
    const warehouseId = String(row.warehouseId);
    return { row, free: await freeStock(db, productId, warehouseId), waiting: await backorderedStock(db, productId, warehouseId) };
  }));
  const belowReorder = levels.filter(({ row }) => num(row.onHand) < num(row.reorderPoint));
  const openPos = purchaseOrders.filter((row) => !["received", "draft"].includes(poStatus(row)));
  const units = inventory.reduce((sum, row) => sum + num(row.onHand), 0);
  const stock = levels
    .filter(({ row }) => {
      const product = productById.get(String(row.productId));
      return (!values.warehouse || row.warehouseId === values.warehouse)
        && (!values.family || product?.family === values.family)
        && (values.stock !== "low" || num(row.onHand) < lowStock)
        && (values.stock !== "ok" || num(row.onHand) >= lowStock)
        && (values.low !== "reorder" || num(row.onHand) < num(row.reorderPoint))
        && textMatches(values.q, [product?.name, product?.sku, product?.family]);
    })
    .sort((a, b) => (num(a.row.onHand) - num(a.row.reorderPoint)) - (num(b.row.onHand) - num(b.row.reorderPoint)));
  const shownRows = await Promise.all(stock.map(async (level) => ({
    ...level,
    reorderBlocked: await preflight("start-po", person, { inventoryId: String(level.row.id) }),
    suggested: await suggestedQuantity(db, level.row),
    releaseBlocked: level.waiting > 0 ? await preflight("release-backorders", person, { productId: String(level.row.productId), warehouseId: String(level.row.warehouseId) }) : "",
  })));
  const warehouseOptions = warehouses.map((row) => ({ value: String(row.id), label: String(row.name) }));
  const supplierOptions = suppliers.map((row) => ({ value: String(row.id), label: `${String(row.name)} · min ${money(row.minOrderDollars)}` }));
  const orders = purchaseOrders
    .filter((row) => !values.warehouse || row.warehouseId === values.warehouse)
    .sort((a, b) => String(b.id).localeCompare(String(a.id), undefined, { numeric: true }));
  const ops = opsCheck(person);

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Supply</h1>
          <p>{belowReorder.length ? `${belowReorder.length} stock lines are below their reorder point.` : "Every stock line is above its reorder point."} Free stock is on hand minus what open orders and scheduled redeliveries have reserved.</p>
        </div>
        <div className="actions">
          <ExportLink name="inventory" label="Export stock" />
          <a className="btn ghost" id="filter-below-reorder" href="/supply?low=reorder">Below reorder point</a>
          <ActionButton
            icon="tick"
            label="Cycle count"
            title="Cycle count"
            description="Enter what you counted on the shelf. It replaces the on-hand number."
            endpoint="/api/records/inventory/{id}"
            method="PATCH"
            success="Count saved."
            blocked={ops}
            why="title"
            fields={[
              { name: "id", label: "Stock line", type: "select", options: inventory.map((row) => ({ value: String(row.id), label: `${String(productById.get(String(row.productId))?.name)} · ${nameOf(row.warehouseId)} (${row.onHand})` })) },
              { name: "onHand", label: "Counted", type: "number", required: true },
            ]}
          />
          <ActionButton
            variant="primary"
            icon="plus"
            kiwi="new-purchase-order"
            label="New purchase order"
            title="New purchase order"
            description="Starts as a draft. Add lines, then submit."
            endpoint="/api/records/purchase-orders"
            redirect="/purchase-orders/{id}"
            submit="Create draft"
            blocked={ops}
            why="title"
            fields={[
              { name: "supplierId", label: "Supplier", type: "select", required: true, options: supplierOptions },
              { name: "warehouseId", label: "Deliver to", type: "select", required: true, options: warehouseOptions },
            ]}
          />
        </div>
      </div>

      <div className="stats">
        <article className="card stat"><span>Units on hand</span><strong>{units.toLocaleString()}</strong><em>across {warehouses.length} warehouses</em></article>
        <article className="card stat tone-indigo"><span>Products</span><strong>{products.length}</strong><em>{priceBooks.length} price books</em></article>
        <article className="card stat tone-amber"><span>Open purchase orders</span><strong>{openPos.length}</strong><em>{purchaseOrders.filter((row) => row.status === "draft").length} drafts · {purchaseOrders.length} in total</em></article>
        <article className="card stat tone-red"><span>Below reorder point</span><strong>{belowReorder.length}</strong><em>{levels.filter((level) => level.waiting > 0).length} with backorders</em></article>
      </div>

      <div className="warehouses">
        {warehouses.map((warehouse) => {
          const rows = levels.filter(({ row }) => row.warehouseId === warehouse.id);
          const total = rows.reduce((sum, { row }) => sum + num(row.onHand), 0);
          const selected = values.warehouse === warehouse.id;
          return (
            <a className={`panel warehouse${selected ? " selected" : ""}`} key={String(warehouse.id)} href={selected ? "/supply" : `/supply?warehouse=${warehouse.id}`}>
              <div className="panel-label">{String(warehouse.kind)}</div>
              <h2>{String(warehouse.name)}</h2>
              <strong className="units">{total.toLocaleString()} units</strong>
              <small>{nameOf(warehouse.officeId)} · {rows.length} products · {rows.filter(({ row }) => num(row.onHand) < num(row.reorderPoint)).length} below reorder</small>
              <div className="mini-bars">
                {[...rows].sort((a, b) => num(a.row.onHand) - num(b.row.onHand)).slice(0, 4).map(({ row }) => (
                  <div key={String(row.id)}>
                    <span>{String(productById.get(String(row.productId))?.name)}</span>
                    <i className={num(row.onHand) < num(row.reorderPoint) ? "low" : ""} style={{ width: `${Math.min(100, num(row.onHand))}%` }} />
                    <em>{num(row.onHand)}</em>
                  </div>
                ))}
              </div>
            </a>
          );
        })}
      </div>

      <section className="panel" data-kiwi="results">
        <div className="panel-head"><h2>Stock</h2><span>furthest below reorder point first</span></div>
        <FilterBar path="/supply" filters={filters} values={values} shown={stock.length} total={inventory.length} noun="stock lines" />
        <div className="scroll tall">
          <table>
            <thead><tr><th>Product</th><th>Family</th><th>Warehouse</th><th className="num">On hand</th><th className="num">Free</th><th className="num">Backordered</th><th className="num">Reorder point</th><th></th></tr></thead>
            <tbody>
              {shownRows.length === 0 ? <tr><td colSpan={8} className="empty">No stock matches those filters.</td></tr> : shownRows.map(({ row, free, waiting, reorderBlocked, suggested, releaseBlocked }) => {
                const product = productById.get(String(row.productId));
                const below = num(row.onHand) < num(row.reorderPoint);
                return (
                  <tr key={String(row.id)}>
                    <td><strong>{String(product?.name)}</strong><small className="sub">{String(product?.sku ?? "")} · {nameOf(product?.supplierId)}</small></td>
                    <td>{String(product?.family ?? "")}</td>
                    <td>{nameOf(row.warehouseId)}</td>
                    <td className="num"><span className={below ? "pill bad" : "pill"}>{num(row.onHand)}</span></td>
                    <td className="num">{free}</td>
                    <td className="num">{waiting > 0 ? <span className="pill bad">{waiting}</span> : 0}</td>
                    <td className="num">{num(row.reorderPoint)}</td>
                    <td>
                      <div className="row-actions">
                        <ActionButton
                          small
                          kiwi={`reorder-${row.productId}`}
                          icon="plus"
                          label="Reorder"
                          title={`Reorder ${String(product?.name)}`}
                          description={`Starts a draft to ${nameOf(product?.supplierId)} for ${suggested} (reorder quantity plus what is backordered).`}
                          action="start-po"
                          hidden={{ inventoryId: String(row.id) }}
                          redirect="/purchase-orders/{id}"
                          submit="Start draft"
                          blocked={reorderBlocked}
                          why="title"
                          fields={[]}
                        />
                        {waiting > 0 ? (
                          <ActionButton
                            small
                            kiwi={`release-backorders-${row.productId}`}
                            icon="truck"
                            label="Release backorders"
                            title={`Release ${String(product?.name)} backorders`}
                            description={`${free} free fills waiting order lines, oldest first.`}
                            action="release-backorders"
                            hidden={{ productId: String(row.productId), warehouseId: String(row.warehouseId) }}
                            submit="Release"
                            blocked={releaseBlocked}
                            why="title"
                            fields={[]}
                          />
                        ) : null}
                        <ActionButton
                          small
                          icon="tick"
                          label="Count"
                          title={`Count ${String(product?.name)} at ${nameOf(row.warehouseId)}`}
                          endpoint={`/api/records/inventory/${row.id}`}
                          method="PATCH"
                          success="Count saved."
                          blocked={ops}
                          why="title"
                          fields={[
                            { name: "onHand", label: "Counted", type: "number", value: String(row.onHand), required: true },
                            { name: "reorderPoint", label: "Reorder point", type: "number", value: String(row.reorderPoint ?? "") },
                            { name: "reorderQty", label: "Reorder quantity", type: "number", value: String(row.reorderQty ?? "") },
                          ]}
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
        <div className="scroll short">
          <table>
            <thead><tr><th>PO</th><th>Supplier</th><th>Deliver to</th><th>Status</th><th>Expected</th><th className="num">Total</th></tr></thead>
            <tbody>
              {orders.length === 0 ? <tr><td colSpan={6} className="empty">No purchase orders here.</td></tr> : orders.map((row) => (
                <tr key={String(row.id)}>
                  <td><a href={`/purchase-orders/${row.id}`}>{String(row.id)}</a></td>
                  <td>{nameOf(row.supplierId)}</td>
                  <td>{nameOf(row.warehouseId)}</td>
                  <td><Pill value={poStatus(row)} /></td>
                  <td>{row.expectedDate ? prettyDate(row.expectedDate) : "—"}</td>
                  <td className="num">{row.total != null ? money(row.total) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
