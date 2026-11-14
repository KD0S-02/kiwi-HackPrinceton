import { addDays, money, nextNumberedId, round2, today, type Row } from "../../data";
import { logActivity } from "../activity";
import { requestApproval } from "../approvals";
import { find, num, type Db } from "../db";
import { opsCheck } from "../permissions";
import { must, refuse } from "../refused";
import { backorderedStock, familiesFor, freeStock, lineWarehouse, warehouseTakes } from "../stock";
import { wholeNumber, type Action } from "./types";

// Workflow 4: reorder low stock, meet the supplier minimum, get approval, send, receive, fill backorders.

// Legacy purchase orders were "open" once they went to the supplier.
export function poStatus(po: Row) {
  return po.status === "open" ? "sent" : String(po.status ?? "");
}

async function poContext(db: Db, poId: string) {
  const po = await find(db, "purchase-orders.json", poId);
  if (!po) refuse("That purchase order was not found.");
  const lines = (await db.rows("purchase-order-lines.json")).filter((row) => row.poId === po.id);
  return { po, lines };
}

function retotal(po: Row, lines: Row[]) {
  po.total = round2(lines.reduce((sum, line) => sum + num(line.quantity) * num(line.unitCost), 0));
}

function mustBeDraft(po: Row) {
  if (poStatus(po) !== "draft") refuse(`${po.id} is ${poStatus(po)}. Only a draft can change.`);
}

export async function suggestedQuantity(db: Db, stock: Row) {
  const free = await freeStock(db, String(stock.productId), String(stock.warehouseId));
  const waiting = await backorderedStock(db, String(stock.productId), String(stock.warehouseId));
  return Math.max(num(stock.reorderQty), num(stock.reorderPoint) - free) + waiting;
}

export const startPo: Action = async ({ db, person, values }) => {
  must(opsCheck(person));
  const stock = await find(db, "inventory.json", values.inventoryId);
  if (!stock) refuse("That stock line was not found.");
  const product = await find(db, "products.json", stock.productId);
  if (!product) refuse("That product was not found.");
  const pos = await db.rows("purchase-orders.json");
  const draft = pos.find((row) => row.supplierId === product.supplierId && row.warehouseId === stock.warehouseId && row.status === "draft");
  if (draft) refuse(`${draft.id} is already a draft to ${await db.name(product.supplierId)} for ${await db.name(stock.warehouseId)}. Add to it instead.`);
  const quantity = await suggestedQuantity(db, stock);
  const id = nextNumberedId("po", pos);
  const line = { id: `pol-${id}-1`, poId: id, productId: product.id, quantity, unitCost: num(product.cost), received: 0 };
  const po: Row = { id, supplierId: product.supplierId, warehouseId: stock.warehouseId, status: "draft", createdBy: person.id, total: 0, approvalId: "", sentAt: "", expectedDate: "" };
  retotal(po, [line]);
  pos.push(po);
  (await db.rows("purchase-order-lines.json")).push(line);
  await logActivity(db, { subjectType: "purchase-order", subjectId: id, by: person.id, text: `${person.name} started ${id} to ${await db.name(product.supplierId)}: ${quantity} ${product.name}.` });
  return { id, message: `Started ${id}.` };
};

export const addPoLine: Action = async ({ db, person, values }) => {
  must(opsCheck(person));
  const { po, lines } = await poContext(db, values.poId);
  mustBeDraft(po);
  const product = await find(db, "products.json", values.productId);
  if (!product) refuse("Pick a product.");
  if (product.supplierId !== po.supplierId) refuse(`${product.name} comes from ${await db.name(product.supplierId)}.`);
  const rules = await db.rules();
  if (!warehouseTakes(rules, String(po.warehouseId), product.family)) refuse(`${await db.name(po.warehouseId)} only receives ${familiesFor(rules, String(po.warehouseId)).join(", ")}.`);
  const quantity = wholeNumber(values.quantity, "Enter a quantity of at least 1.");
  const all = await db.rows("purchase-order-lines.json");
  const same = lines.find((line) => line.productId === product.id);
  if (same) same.quantity = num(same.quantity) + quantity;
  else {
    const line = { id: `pol-${po.id}-${lines.length + 1}`, poId: po.id, productId: product.id, quantity, unitCost: num(product.cost), received: 0 };
    all.push(line);
    lines.push(line);
  }
  retotal(po, lines);
  await logActivity(db, { subjectType: "purchase-order", subjectId: String(po.id), by: person.id, text: `${person.name} added ${quantity} ${product.name} to ${po.id}.` });
  return { message: `Added ${quantity} ${product.name}. Total ${money(po.total)}.` };
};

export const editPoLine: Action = async ({ db, person, values }) => {
  must(opsCheck(person));
  const line = await find(db, "purchase-order-lines.json", values.lineId);
  if (!line) refuse("That line was not found.");
  const { po, lines } = await poContext(db, String(line.poId));
  mustBeDraft(po);
  line.quantity = wholeNumber(values.quantity, "Enter a quantity of at least 1.");
  retotal(po, lines);
  return { message: `Updated. Total ${money(po.total)}.` };
};

export const submitPo: Action = async ({ db, person, values }) => {
  must(opsCheck(person));
  const { po, lines } = await poContext(db, values.poId);
  mustBeDraft(po);
  if (lines.length === 0) refuse("Add a line before you submit.");
  retotal(po, lines);
  const supplier = await find(db, "suppliers.json", po.supplierId);
  const minimum = num(supplier?.minOrderDollars);
  if (num(po.total) < minimum) refuse(`${supplier?.name} needs ${money(minimum)}. This order is ${money(po.total)}.`);
  const rules = await db.rules();
  await logActivity(db, { subjectType: "purchase-order", subjectId: String(po.id), by: person.id, text: `${person.name} submitted ${po.id} for ${money(po.total)}.` });
  if (num(po.total) > rules.purchaseOrderApprovalOverDollars) {
    po.status = "pending approval";
    const { approval, message } = await requestApproval(db, person, { kind: "purchase order", subjectType: "purchase-order", subjectId: String(po.id), accountId: "", amount: num(po.total) });
    po.approvalId = String(approval.id);
    return { message };
  }
  po.status = "approved";
  return { message: `${po.id} is approved. Send it to ${supplier?.name}.` };
};

export const sendPo: Action = async ({ db, person, values }) => {
  must(opsCheck(person));
  const { po } = await poContext(db, values.poId);
  if (poStatus(po) !== "approved") refuse(`${po.id} is ${poStatus(po)}. It has to be approved before it goes to the supplier.`);
  const supplier = await find(db, "suppliers.json", po.supplierId);
  po.status = "sent";
  po.sentAt = today();
  po.expectedDate = addDays(today(), num(supplier?.leadDays) || 5);
  await logActivity(db, { subjectType: "purchase-order", subjectId: String(po.id), by: person.id, text: `${person.name} sent ${po.id} to ${supplier?.name}. Expected ${po.expectedDate}.` });
  return { message: `Sent to ${supplier?.name}. Expected ${po.expectedDate}.` };
};

export const receivePo: Action = async ({ db, person, values }) => {
  must(opsCheck(person));
  const { po, lines } = await poContext(db, values.poId);
  const status = poStatus(po);
  if (status !== "sent" && status !== "partially received") refuse(`${po.id} is ${status}. Only a sent purchase order can be received.`);
  if (lines.length === 0) refuse(`${po.id} has no lines to receive.`);
  const counts: [Row, number][] = [];
  for (const line of lines) {
    const raw = values[`received:${line.id}`];
    if (raw == null || raw === "") continue;
    const quantity = wholeNumber(raw, "Enter whole numbers for what arrived.", 0);
    const remaining = num(line.quantity) - num(line.received);
    if (quantity > remaining) refuse(`Only ${remaining} ${await db.name(line.productId)} are still due on ${po.id}.`);
    if (quantity > 0) counts.push([line, quantity]);
  }
  if (counts.length === 0) refuse("Enter what arrived on at least one line.");
  const inventory = await db.rows("inventory.json");
  const received: string[] = [];
  for (const [line, quantity] of counts) {
    line.received = num(line.received) + quantity;
    let stock = inventory.find((row) => row.productId === line.productId && row.warehouseId === po.warehouseId);
    if (!stock) {
      stock = { id: `inv-${line.productId}-${po.warehouseId}`, productId: line.productId, warehouseId: po.warehouseId, onHand: 0, reorderPoint: 30, reorderQty: 40 };
      inventory.push(stock);
    }
    stock.onHand = num(stock.onHand) + quantity;
    received.push(`${quantity} ${await db.name(line.productId)}`);
  }
  po.status = lines.every((line) => num(line.received) >= num(line.quantity)) ? "received" : "partially received";
  await logActivity(db, { subjectType: "purchase-order", subjectId: String(po.id), by: person.id, text: `${person.name} received ${received.join(", ")} on ${po.id}.` });
  return { message: `Received ${received.join(", ")}. ${po.id} is ${po.status}.` };
};

export const releaseBackorders: Action = async ({ db, person, values }) => {
  must(opsCheck(person));
  const product = await db.name(values.productId);
  const warehouse = await db.name(values.warehouseId);
  const [orders, orderLines] = await Promise.all([db.rows("orders.json"), db.rows("order-lines.json")]);
  const orderById = new Map(orders.map((order) => [String(order.id), order]));
  const waiting = orderLines
    .filter((line) => {
      const order = orderById.get(String(line.orderId));
      return line.productId === values.productId && num(line.backordered) > 0 && order && ["open", "backordered"].includes(String(order.status)) && lineWarehouse(line, order) === values.warehouseId;
    })
    .sort((a, b) => String(a.orderId).localeCompare(String(b.orderId), undefined, { numeric: true }));
  if (waiting.length === 0) refuse(`Nothing is waiting on ${product} at ${warehouse}.`);
  let free = await freeStock(db, values.productId, values.warehouseId);
  if (free <= 0) refuse(`No ${product} is free at ${warehouse} yet. Receive stock first.`);
  const filled: string[] = [];
  for (const line of waiting) {
    if (free <= 0) break;
    const take = Math.min(free, num(line.backordered));
    line.allocated = num(line.allocated) + take;
    line.backordered = num(line.backordered) - take;
    free -= take;
    const order = orderById.get(String(line.orderId));
    if (order && orderLines.filter((row) => row.orderId === order.id).every((row) => num(row.backordered) === 0)) order.status = "open";
    filled.push(`${take} to ${line.orderId}`);
  }
  await logActivity(db, { subjectType: "inventory", subjectId: `${values.productId}@${values.warehouseId}`, by: person.id, text: `${person.name} released ${product} backorders at ${warehouse}: ${filled.join(", ")}.` });
  return { message: `Released ${product}: ${filled.join(", ")}.` };
};
