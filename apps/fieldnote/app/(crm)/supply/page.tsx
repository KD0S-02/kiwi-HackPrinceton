import { ActionButton } from "../../../components/ActionButton";
import { ExportLink } from "../../../components/ExportLink";
import { FilterBar } from "../../../components/FilterBar";
import { loadNames, money } from "../../../lib/data";
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
  const [warehouses, inventory, products, suppliers, purchaseOrders, nameOf] = await Promise.all([
    db.rows("warehouses.json"),
    db.rows("inventory.json"),
    db.rows("products.json"),
    db.rows("suppliers.json"),
    db.rows("purchase-orders.json"),
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
  const ops = opsCheck(person);

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Supply</h1>
          <p>{belowReorder.length ? `${belowReorder.length} lines below reorder.` : "Everything is above reorder."} Free is on hand minus open orders and redeliveries.</p>
        </div>
        <div className="actions">
          <a className="btn ghost" id="filter-below-reorder" href="/supply?low=reorder">Below reorder · {belowReorder.length}</a>
          <a className="btn ghost" href="/purchase-orders">Purchase orders · {openPos.length}</a>
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

      <nav className="place-switch" aria-label="Warehouses">
        <a className={!values.warehouse ? "on" : undefined} href="/supply">All warehouses</a>
        {warehouses.map((warehouse) => {
          const rows = levels.filter(({ row }) => row.warehouseId === warehouse.id);
          const low = rows.filter(({ row }) => num(row.onHand) < num(row.reorderPoint)).length;
          const selected = values.warehouse === warehouse.id;
          return (
            <a
              key={String(warehouse.id)}
              className={selected ? "on" : undefined}
              href={selected ? "/supply" : `/supply?warehouse=${warehouse.id}`}
              data-kiwi={`warehouse-${warehouse.id}`}
            >
              {String(warehouse.name)}
              {low > 0 ? <em>{low} low</em> : null}
            </a>
          );
        })}
      </nav>

      <section className="panel" data-kiwi="results">
        <div className="panel-head">
          <h2>Stock</h2>
          <span>{units.toLocaleString()} units · furthest below reorder first · <ExportLink name="inventory" label="Export" /></span>
        </div>
        <FilterBar path="/supply" filters={filters} values={values} shown={stock.length} total={inventory.length} noun="stock lines" />
        <div className="scroll tall">
          <table>
            <thead><tr><th>Product</th><th>Warehouse</th><th className="num">On hand</th><th className="num">Free</th><th className="num">Backordered</th><th className="num">Reorder at</th><th></th></tr></thead>
            <tbody>
              {shownRows.length === 0 ? <tr><td colSpan={7} className="empty">No stock matches those filters.</td></tr> : shownRows.map(({ row, free, waiting, reorderBlocked, suggested, releaseBlocked }) => {
                const product = productById.get(String(row.productId));
                const below = num(row.onHand) < num(row.reorderPoint);
                return (
                  <tr key={String(row.id)}>
                    <td>
                      <strong>{String(product?.name)}</strong>
                      <small className="sub">{String(product?.family ?? "")} · {String(product?.sku ?? "")}</small>
                    </td>
                    <td>{nameOf(row.warehouseId)}</td>
                    <td className="num"><span className={below ? "pill bad" : "pill"}>{num(row.onHand)}</span></td>
                    <td className="num">{free}</td>
                    <td className="num">{waiting > 0 ? <span className="pill bad">{waiting}</span> : "—"}</td>
                    <td className="num">{num(row.reorderPoint)}</td>
                    <td>
                      <div className="row-actions">
                        {below ? (
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
                        ) : null}
                        {waiting > 0 ? (
                          <ActionButton
                            small
                            kiwi={`release-backorders-${row.productId}`}
                            icon="truck"
                            label="Release"
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
    </section>
  );
}
