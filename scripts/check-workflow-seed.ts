// Seed checks for the workflows (run from check-seed.ts). Legacy rows must keep every committed
// field and value, Harbor Diner must be exactly as committed, and the fixtures must hold their numbers.
import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { dataDirectory, recordsDirectory, repoRoot } from "./paths.ts";

type Row = Record<string, string | number | null>;
const problems: string[] = [];
const fail = (message: string) => problems.push(message);
const read = async (file: string): Promise<Row[]> => JSON.parse(await readFile(path.join(recordsDirectory, file), "utf8"));
const committed = (file: string): Row[] | undefined => {
  try {
    return JSON.parse(execFileSync("git", ["show", `HEAD:data/records/${file}`], { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  } catch {
    return undefined;
  }
};

// Legacy rows are a superset of HEAD.
for (const file of await readdir(recordsDirectory)) {
  const before = committed(file);
  if (!before) continue;
  const now = new Map((await read(file)).map((row) => [String(row.id), row]));
  for (const old of before) {
    const current = now.get(String(old.id));
    if (!current) {
      fail(`${file}: ${old.id} is missing`);
      continue;
    }
    for (const [key, value] of Object.entries(old)) {
      // The fixtures set fryer oil's on-hand count; it is 24 in HEAD already.
      if (JSON.stringify(current[key]) !== JSON.stringify(value)) fail(`${file}: ${old.id}.${key} changed from ${JSON.stringify(value)} to ${JSON.stringify(current[key])}`);
    }
  }
}

const [opportunities, lineItems, activity, quotes, orders, orderLines, invoices, shipments, shipmentLines, inventory, cases, accounts, products, contacts, priceBookEntries] = await Promise.all(
  ["opportunities", "line-items", "activity", "quotes", "orders", "order-lines", "invoices", "shipments", "shipment-lines", "inventory", "cases", "accounts", "products", "contacts", "price-book-entries"].map((name) => read(`${name}.json`)),
);

// Harbor Diner is unchanged.
const harbor = opportunities.find((row) => row.id === "opp-harbor-diner");
if (harbor?.discountPercent !== 20 || harbor?.amount !== 12400) fail("Harbor Diner is not 20 percent and $12,400");
if (lineItems.filter((row) => row.opportunityId === "opp-harbor-diner").length !== 3) fail("Harbor Diner should have 3 line items");
if (activity.filter((row) => row.opportunityId === "opp-harbor-diner").length !== 2) fail("Harbor Diner should have 2 activity rows");
if (quotes.some((row) => row.opportunityId === "opp-harbor-diner")) fail("Harbor Diner should have no quote");
if (orders.some((row) => row.accountId === "harbor-diner")) fail("Harbor Diner should have no order");

// Every reference resolves.
const ids = (rows: Row[]) => new Set(rows.map((row) => String(row.id)));
const known: Record<string, Set<string>> = { orderId: ids(orders), productId: ids(products), shipmentId: ids(shipments), invoiceId: ids(invoices), accountId: ids(accounts) };
for (const [file, rows] of [["order-lines", orderLines], ["shipment-lines", shipmentLines], ["price-book-entries", priceBookEntries], ["cases", cases], ["invoices", invoices]] as const) {
  for (const row of rows) {
    for (const [key, set] of Object.entries(known)) {
      if (row[key] && !set.has(String(row[key]))) fail(`${file}: ${row.id}.${key} points at missing ${row[key]}`);
    }
  }
}

// Totals match.
for (const order of orders) {
  const lines = orderLines.filter((row) => row.orderId === order.id);
  if (lines.length === 0) continue;
  const total = lines.reduce((sum, line) => sum + Number(line.quantity) * Number(line.unitPrice), 0);
  if (Math.abs(total - Number(order.amount)) > 1) fail(`${order.id}: lines total ${total.toFixed(2)} but amount ${order.amount}`);
}
for (const invoice of invoices) {
  if (Number(invoice.paid ?? 0) + Number(invoice.credited ?? 0) > Number(invoice.amount) + 0.001) fail(`${invoice.id}: paid and credited are more than the amount`);
}

// Fixtures hold their numbers.
const reserving = new Set(orders.filter((row) => ["open", "backordered", "picking"].includes(String(row.status))).map((row) => String(row.id)));
const free = (productId: string, warehouseId: string) => {
  const onHand = Number(inventory.find((row) => row.productId === productId && row.warehouseId === warehouseId)?.onHand ?? 0);
  const reserved = orderLines
    .filter((line) => line.productId === productId && reserving.has(String(line.orderId)) && (line.warehouseId || orders.find((row) => row.id === line.orderId)?.warehouseId) === warehouseId)
    .reduce((sum, line) => sum + Number(line.allocated ?? 0), 0);
  return onHand - reserved;
};
if (free("fryer-oil", "newark-dry-goods") !== 6) fail(`fryer oil at Newark has ${free("fryer-oil", "newark-dry-goods")} free, not 6`);
if (free("canola", "newark-dry-goods") !== 28) fail(`canola at Newark has ${free("canola", "newark-dry-goods")} free, not 28`);
if (free("gloves", "newark-dry-goods") !== 28) fail(`gloves at Newark has ${free("gloves", "newark-dry-goods")} free, not 28`);
const juniper = accounts.find((row) => row.id === "juniper-deli");
if (juniper?.creditHold !== "yes") fail("Juniper Deli is not on credit hold");
const invoice17 = invoices.find((row) => row.id === "invoice-17");
if (!invoice17 || invoice17.status !== "open" || String(invoice17.dueDate) >= "2026-10-15") fail("invoice-17 is not open and past due");
const case13 = cases.find((row) => row.id === "case-13");
if (case13?.orderId !== "order-16" || case13?.shipmentId !== "shipment-11" || case13?.invoiceId !== "invoice-16") fail("case-13 does not link order-16, shipment-11 and invoice-16");
if (!contacts.some((row) => row.accountId === "juniper-deli" && row.role === "accounts payable" && row.email)) fail("Juniper Deli has no accounts payable contact");
if (accounts.some((row) => row.status !== "active")) fail("every seeded account should be active");

const rules = JSON.parse(await readFile(path.join(dataDirectory, "rules.json"), "utf8"));
for (const key of ["creditApprovalOverDollars", "paymentPlanApprovalOverDollars", "paymentPlanMaxInstallmentsWithoutApproval", "purchaseOrderApprovalOverDollars", "autoCreditLimitDollars", "holdAfterDaysPastDue", "quoteValidDays", "financeApproverId", "deliveryDays", "warehouseFamilies"]) {
  if (rules[key] === undefined) fail(`rules.json is missing ${key}`);
}

if (problems.length) {
  console.error(problems.map((line) => `FAIL ${line}`).join("\n"));
  throw new Error(`${problems.length} workflow seed problem(s)`);
}
console.log("workflow seed ok");
