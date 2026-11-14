// Adds the workflow data on top of the committed records: new fields on existing rows (only where
// a field is missing, so every existing value stays as it is), the new line and money files, and
// the fixtures each workflow starts from. Running it again gives the same files.
//
// It does not use generate-company.ts, because the committed records have moved on from what the
// generator writes (for example, Sparsh reports to Shail in the records). Harbor Diner is not touched.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { dataDirectory, recordsDirectory } from "./paths.ts";

type Row = Record<string, string | number | null>;

const read = async (file: string): Promise<Row[]> => {
  try {
    return JSON.parse(await readFile(path.join(recordsDirectory, file), "utf8"));
  } catch {
    return [];
  }
};
const write = (file: string, rows: unknown) => writeFile(path.join(recordsDirectory, file), `${JSON.stringify(rows, null, 2)}\n`);
const round2 = (value: number) => Math.round(value * 100) / 100;
const fill = (row: Row, defaults: Row) => {
  for (const [key, value] of Object.entries(defaults)) if (row[key] === undefined) row[key] = value;
};
const upsert = (rows: Row[], row: Row) => {
  const index = rows.findIndex((item) => item.id === row.id);
  if (index === -1) rows.push(row);
  else rows[index] = row;
};

// ---------- rules ----------
const rulesPath = path.join(dataDirectory, "rules.json");
const rules = JSON.parse(await readFile(rulesPath, "utf8"));
const ruleDefaults = {
  creditApprovalOverDollars: 100,
  paymentPlanApprovalOverDollars: 1000,
  paymentPlanMaxInstallmentsWithoutApproval: 3,
  purchaseOrderApprovalOverDollars: 5000,
  autoCreditLimitDollars: 2500,
  holdAfterDaysPastDue: 30,
  quoteValidDays: 14,
  financeApproverId: "krishna-das",
  deliveryDays: { northeast: "Tue|Fri", southeast: "Mon|Thu", midwest: "Wed", west: "Thu" },
  warehouseFamilies: {
    "jersey-city-cold": "dairy",
    "newark-dry-goods": "dry goods|paper|oil|smallwares",
    "chicago-dry": "dry goods|paper|oil|smallwares",
  },
};
await writeFile(rulesPath, `${JSON.stringify({ ...ruleDefaults, ...rules }, null, 2)}\n`);
const deliveryDays: Record<string, string> = { ...ruleDefaults.deliveryDays, ...rules.deliveryDays };

// ---------- reference data ----------
const zipPrefixes: Record<string, string> = { northeast: "07|08|10|11|12", southeast: "27|28|29|30|31|32|33", midwest: "46|53|60|61", west: "90|91|94|98" };
const territories = await read("territories.json");
for (const row of territories) fill(row, { zipPrefixes: zipPrefixes[String(row.id)] ?? "" });

const products = await read("products.json");
for (const row of products) fill(row, { cost: round2(Number(row.price) * 0.6) });
const productById = new Map(products.map((row) => [String(row.id), row]));

const suppliers = await read("suppliers.json");
suppliers.forEach((row, index) => fill(row, { minOrderDollars: 500, leadDays: 3 + (index % 5) }));

const inventory = await read("inventory.json");
for (const row of inventory) fill(row, { reorderPoint: 30, reorderQty: 40 });
const fryer = inventory.find((row) => row.productId === "fryer-oil" && row.warehouseId === "newark-dry-goods");
if (fryer) Object.assign(fryer, { onHand: 24, reorderPoint: 40, reorderQty: 60 });

const priceBookEntries: Row[] = products.map((product) => ({ id: `pbe-northeast-${product.id}`, priceBookId: "northeast", productId: product.id, price: round2(Number(product.price) * 1.05) }));
const priceFor = (account: Row | undefined, productId: string) => {
  const product = productById.get(productId);
  return account?.priceBookId === "northeast" ? round2(Number(product?.price) * 1.05) : Number(product?.price);
};

// ---------- accounts and contacts ----------
const accounts = await read("accounts.json");
const prefixCursor: Record<string, number> = {};
for (const row of accounts) {
  const territory = String(row.territoryId ?? "");
  const prefixes = (zipPrefixes[territory] ?? "07").split("|");
  const count = (prefixCursor[territory] = (prefixCursor[territory] ?? 0) + 1);
  fill(row, {
    status: "active",
    zip: `${prefixes[count % prefixes.length]}${String(100 + count * 7).padStart(3, "0")}`,
    territoryConfirmed: "yes",
    priceBookId: territory === "northeast" ? "northeast" : "standard",
    deliveryDays: deliveryDays[territory] ?? "",
    taxStatus: "taxable",
    taxCertificate: "",
    taxExpires: "",
    creditLimit: 5000,
    creditStatus: "approved",
    paymentTerms: "net 30",
    creditHold: "",
    holdReason: "",
    holdSince: "",
  });
}
const accountById = new Map(accounts.map((row) => [String(row.id), row]));

const emailFor = (name: unknown, accountId: unknown) => `${String(name).toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "")}@${accountId}.example`;
const contacts = await read("contacts.json");
for (const row of contacts) fill(row, { email: emailFor(row.name, row.accountId), phone: "" });

// ---------- legacy orders, shipments, invoices, quotes, approvals, activity, cases, lines ----------
const protectedProducts = new Set(["fryer-oil", "gloves", "canola", "napkins", "olive-oil", "rice"]);
const orders = await read("orders.json");
const orderLines = (await read("order-lines.json")).filter((row) => !String(row.id).startsWith("ol-legacy-") && !/^ol-order-(1[6-9]|20)-/.test(String(row.id)));
const legacyOrderIds = orders.filter((row) => /^order-([1-9]|1[0-5])$/.test(String(row.id))).map((row) => String(row.id));
for (const order of orders) {
  if (!legacyOrderIds.includes(String(order.id))) continue;
  fill(order, { quoteId: "", opportunityId: "", deliveryDate: order.status === "delivered" ? "2026-10-20" : "2026-11-17", holdReason: "" });
  const stocked = inventory.filter((row) => row.warehouseId === order.warehouseId && !protectedProducts.has(String(row.productId)));
  const pick = stocked.sort((a, b) => Number(productById.get(String(b.productId))?.price) - Number(productById.get(String(a.productId))?.price))[Number(String(order.id).split("-")[1]) % 3] ?? stocked[0];
  const price = Number(productById.get(String(pick?.productId))?.price || 1);
  const quantity = Math.max(1, Math.round(Number(order.amount) / price));
  const allocated = order.status === "delivered" ? quantity : Math.min(quantity, Number(pick?.onHand ?? 0));
  orderLines.push({ id: `ol-legacy-${order.id}`, orderId: order.id, productId: pick?.productId ?? "", quantity, unitPrice: round2(Number(order.amount) / quantity), allocated, backordered: 0, warehouseId: order.warehouseId });
}

const shipments = await read("shipments.json");
const shipmentLines = (await read("shipment-lines.json")).filter((row) => !String(row.id).startsWith("sl-legacy-") && !String(row.id).startsWith("sl-shipment-11-"));
for (const shipment of shipments) {
  if (!/^shipment-([1-9]|10)$/.test(String(shipment.id))) continue;
  fill(shipment, { deliveryDate: shipment.status === "delivered" ? "2026-10-20" : "2026-11-17", redeliveryOf: "" });
  for (const line of orderLines.filter((row) => row.orderId === shipment.orderId)) {
    shipmentLines.push({ id: `sl-legacy-${shipment.id}-${line.productId}`, shipmentId: shipment.id, productId: line.productId, quantity: line.quantity, short: 0, redelivered: 0, credited: 0 });
  }
}

const invoices = await read("invoices.json");
for (const invoice of invoices) {
  if (!/^invoice-([1-9]|1[0-5])$/.test(String(invoice.id))) continue;
  const paid = invoice.status === "paid";
  fill(invoice, { issuedAt: paid ? "2026-09-20" : "2026-11-02", dueDate: paid ? "2026-10-20" : "2026-12-02", paid: paid ? invoice.amount : 0, credited: 0 });
}

const opportunities = await read("opportunities.json");
const quotes = await read("quotes.json");
for (const quote of quotes) {
  const buyer = contacts.find((row) => row.accountId === quote.accountId && row.role === "buyer");
  fill(quote, { version: 1, sentTo: buyer?.id ?? "", sentAt: "2026-11-02T15:00:00.000Z", validUntil: "2026-11-16", acceptedBy: "", buyerPo: "", orderId: "" });
}

const approvals = await read("approvals.json");
for (const approval of approvals) {
  const opportunity = opportunities.find((row) => row.id === approval.opportunityId);
  fill(approval, { subjectType: "opportunity", subjectId: approval.opportunityId ?? "", accountId: opportunity?.accountId ?? "", amount: opportunity?.discountPercent ?? 0, note: "", requestedAt: "2026-11-09T14:00:00.000Z", decidedBy: "", decidedAt: "", decisionNote: "" });
}

const activity = await read("activity.json");
for (const row of activity) {
  fill(row, { subjectType: row.opportunityId ? "opportunity" : "account", subjectId: row.opportunityId ?? row.accountId ?? "", by: "", kind: "note", outcome: "" });
}

const cases = await read("cases.json");
for (const row of cases) fill(row, { subject: String(row.kind ?? ""), orderId: "", shipmentId: "", invoiceId: "", resolution: "", openedAt: "2026-11-03", closedAt: "" });

const lineItems = await read("line-items.json");
for (const line of lineItems) {
  const opportunity = opportunities.find((row) => row.id === line.opportunityId);
  fill(line, { unitPrice: priceFor(accountById.get(String(opportunity?.accountId)), String(line.productId)), substituteFor: "" });
}

// ---------- workflow 1: Dockside Bowls short delivery ----------
const dockside = accountById.get("dockside-bowls")!;
const docksideLines = [["gloves", 10], ["fryer-oil", 30], ["napkins", 20]] as const;
const order16Lines: Row[] = docksideLines.map(([productId, quantity], index) => ({ id: `ol-order-16-${index + 1}`, orderId: "order-16", productId, quantity, unitPrice: priceFor(dockside, productId), allocated: quantity, backordered: 0, warehouseId: "newark-dry-goods" }));
const order16Total = round2(order16Lines.reduce((sum, line) => sum + Number(line.quantity) * Number(line.unitPrice), 0));
upsert(orders, { id: "order-16", accountId: "dockside-bowls", warehouseId: "newark-dry-goods", status: "delivered", amount: order16Total, quoteId: "", opportunityId: "", deliveryDate: "2026-11-10", holdReason: "" });
orderLines.push(...order16Lines);
upsert(shipments, { id: "shipment-11", orderId: "order-16", accountId: "dockside-bowls", warehouseId: "newark-dry-goods", status: "delivered", deliveryDate: "2026-11-10", redeliveryOf: "" });
docksideLines.forEach(([productId, quantity]) => shipmentLines.push({ id: `sl-shipment-11-${productId}`, shipmentId: "shipment-11", productId, quantity, short: 0, redelivered: 0, credited: 0 }));
upsert(invoices, { id: "invoice-16", orderId: "order-16", accountId: "dockside-bowls", status: "open", amount: order16Total, issuedAt: "2026-11-10", dueDate: "2026-12-10", paid: 0, credited: 0 });
upsert(cases, { id: "case-13", accountId: "dockside-bowls", ownerId: "user", kind: "missing item", status: "open", subject: "Tuesday truck short 4 gloves and 18 fryer oil", orderId: "order-16", shipmentId: "shipment-11", invoiceId: "invoice-16", resolution: "", openedAt: "2026-11-11", closedAt: "" });

// ---------- fryer oil: 24 on hand at Newark, 18 promised to River Salt, 12 backordered for Cedar Spoon ----------
const riverSalt = accountById.get("river-salt");
const cedarSpoon = accountById.get("cedar-spoon");
upsert(orders, { id: "order-19", accountId: "river-salt", warehouseId: "newark-dry-goods", status: "open", amount: round2(18 * priceFor(riverSalt, "fryer-oil")), quoteId: "", opportunityId: "", deliveryDate: "2026-11-19", holdReason: "" });
orderLines.push({ id: "ol-order-19-1", orderId: "order-19", productId: "fryer-oil", quantity: 18, unitPrice: priceFor(riverSalt, "fryer-oil"), allocated: 18, backordered: 0, warehouseId: "newark-dry-goods" });
upsert(orders, { id: "order-20", accountId: "cedar-spoon", warehouseId: "newark-dry-goods", status: "backordered", amount: round2(12 * priceFor(cedarSpoon, "fryer-oil")), quoteId: "", opportunityId: "", deliveryDate: "2026-11-19", holdReason: "" });
orderLines.push({ id: "ol-order-20-1", orderId: "order-20", productId: "fryer-oil", quantity: 12, unitPrice: priceFor(cedarSpoon, "fryer-oil"), allocated: 0, backordered: 12, warehouseId: "newark-dry-goods" });

// ---------- workflow 3: Juniper Deli on credit hold ----------
const juniper = accountById.get("juniper-deli")!;
Object.assign(juniper, { creditHold: "yes", holdReason: "invoice-17 is past due.", holdSince: "2026-10-16" });
upsert(orders, { id: "order-17", accountId: "juniper-deli", warehouseId: "newark-dry-goods", status: "delivered", amount: 1840, quoteId: "", opportunityId: "", deliveryDate: "2026-08-17", holdReason: "" });
orderLines.push({ id: "ol-order-17-1", orderId: "order-17", productId: "rice", quantity: 50, unitPrice: 32, allocated: 50, backordered: 0, warehouseId: "newark-dry-goods" });
orderLines.push({ id: "ol-order-17-2", orderId: "order-17", productId: "sugar", quantity: 32, unitPrice: 7.5, allocated: 32, backordered: 0, warehouseId: "newark-dry-goods" });
upsert(invoices, { id: "invoice-17", orderId: "order-17", accountId: "juniper-deli", status: "open", amount: 1840, issuedAt: "2026-08-16", dueDate: "2026-09-15", paid: 0, credited: 0 });
upsert(orders, { id: "order-18", accountId: "juniper-deli", warehouseId: "newark-dry-goods", status: "held", amount: 640, quoteId: "", opportunityId: "", deliveryDate: "2026-11-19", holdReason: "invoice-17 is past due." });
orderLines.push({ id: "ol-order-18-1", orderId: "order-18", productId: "rice", quantity: 20, unitPrice: 32, allocated: 0, backordered: 0, warehouseId: "newark-dry-goods" });
upsert(contacts, { id: "contact-juniper-deli-ap", accountId: "juniper-deli", name: "Rosa Lind", role: "accounts payable", email: "rosa.lind@juniper-deli.example", phone: "" });

// ---------- write ----------
const writes: [string, unknown][] = [
  ["territories.json", territories],
  ["products.json", products],
  ["suppliers.json", suppliers],
  ["inventory.json", inventory],
  ["price-book-entries.json", priceBookEntries],
  ["accounts.json", accounts],
  ["contacts.json", contacts],
  ["orders.json", orders],
  ["order-lines.json", orderLines],
  ["shipments.json", shipments],
  ["shipment-lines.json", shipmentLines],
  ["invoices.json", invoices],
  ["quotes.json", quotes],
  ["approvals.json", approvals],
  ["activity.json", activity],
  ["cases.json", cases],
  ["line-items.json", lineItems],
];
for (const [file, rows] of writes) await write(file, rows);
for (const file of ["quote-lines.json", "purchase-order-lines.json", "credit-memos.json", "payments.json", "payment-plans.json", "credit-applications.json"]) {
  await write(file, (await read(file)).length ? await read(file) : []);
}
console.log(`seeded workflows: ${orderLines.length} order lines, ${shipmentLines.length} shipment lines, ${priceBookEntries.length} price-book entries`);
