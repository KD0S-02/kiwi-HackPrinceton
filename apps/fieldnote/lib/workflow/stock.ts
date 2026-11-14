import type { Row, Rules } from "../data";
import { find, num, type Db } from "./db";

// Stock that is promised but not yet shipped. Computed every time, never stored.
const reservingOrders = ["open", "backordered", "picking"];

// Warehouses in the office that covers the account's territory.
export async function servingWarehouses(db: Db, account: Row | undefined) {
  const territory = await find(db, "territories.json", account?.territoryId);
  const warehouses = await db.rows("warehouses.json");
  return warehouses.filter((warehouse) => territory && warehouse.officeId === territory.officeId);
}

export async function onHand(db: Db, productId: string, warehouseId: string) {
  const row = (await db.rows("inventory.json")).find((item) => item.productId === productId && item.warehouseId === warehouseId);
  return num(row?.onHand);
}

// Order lines can ship from their own warehouse; older lines ship from the order's warehouse.
export function lineWarehouse(line: Row, order: Row | undefined) {
  return String(line.warehouseId || order?.warehouseId || "");
}

export async function reservedStock(db: Db, productId: string, warehouseId: string) {
  const [orders, orderLines, shipments, shipmentLines] = await Promise.all([
    db.rows("orders.json"),
    db.rows("order-lines.json"),
    db.rows("shipments.json"),
    db.rows("shipment-lines.json"),
  ]);
  const orderById = new Map(orders.map((order) => [String(order.id), order]));
  let reserved = 0;
  for (const line of orderLines) {
    const order = orderById.get(String(line.orderId));
    if (!order || !reservingOrders.includes(String(order.status)) || line.productId !== productId) continue;
    if (lineWarehouse(line, order) === warehouseId) reserved += num(line.allocated);
  }
  const scheduled = new Set(shipments.filter((row) => row.status === "scheduled" && row.warehouseId === warehouseId).map((row) => String(row.id)));
  for (const line of shipmentLines) {
    if (scheduled.has(String(line.shipmentId)) && line.productId === productId) reserved += num(line.quantity);
  }
  return reserved;
}

export async function freeStock(db: Db, productId: string, warehouseId: string) {
  return Math.max(0, (await onHand(db, productId, warehouseId)) - (await reservedStock(db, productId, warehouseId)));
}

export type FreeAt = { free: number; warehouseId: string; warehouseName: string };

// The serving warehouse with the most free stock of a product.
export async function freeForAccount(db: Db, account: Row | undefined, productId: string): Promise<FreeAt> {
  const warehouses = await servingWarehouses(db, account);
  let best: FreeAt = { free: 0, warehouseId: String(account?.warehouseId ?? ""), warehouseName: await db.name(account?.warehouseId) };
  let bestHasStock = false;
  for (const warehouse of warehouses) {
    const free = await freeStock(db, productId, String(warehouse.id));
    const stocked = (await onHand(db, productId, String(warehouse.id))) > 0;
    if (free > best.free || (!bestHasStock && stocked && free >= best.free)) {
      best = { free, warehouseId: String(warehouse.id), warehouseName: String(warehouse.name) };
      bestHasStock = stocked;
    }
  }
  return best;
}

export async function backorderedStock(db: Db, productId: string, warehouseId: string) {
  const [orders, orderLines] = await Promise.all([db.rows("orders.json"), db.rows("order-lines.json")]);
  const orderById = new Map(orders.map((order) => [String(order.id), order]));
  return orderLines
    .filter((line) => {
      const order = orderById.get(String(line.orderId));
      return line.productId === productId && order && reservingOrders.includes(String(order.status)) && lineWarehouse(line, order) === warehouseId;
    })
    .reduce((sum, line) => sum + num(line.backordered), 0);
}

export function familiesFor(rules: Rules, warehouseId: string) {
  return String(rules.warehouseFamilies[warehouseId] ?? "").split("|").filter(Boolean);
}

export function warehouseTakes(rules: Rules, warehouseId: string, family: unknown) {
  const families = familiesFor(rules, warehouseId);
  return families.length === 0 || families.includes(String(family ?? ""));
}

// Gives each line stock from the serving warehouse that has the most free, and backorders the rest.
// Lines are changed in place. Returns the order status this leaves: open or backordered.
export async function allocateLines(db: Db, account: Row | undefined, lines: Row[]) {
  for (const line of lines) {
    line.allocated = 0;
    line.backordered = 0;
  }
  for (const line of lines) {
    const best = await freeForAccount(db, account, String(line.productId));
    const quantity = num(line.quantity);
    line.warehouseId = best.warehouseId;
    line.allocated = Math.min(quantity, best.free);
    line.backordered = quantity - num(line.allocated);
  }
  return lines.some((line) => num(line.backordered) > 0) ? "backordered" : "open";
}
