import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const dataDirectory = path.resolve(process.cwd(), "../../data");
export const recordsDirectory = path.join(dataDirectory, "records");

export type Row = Record<string, string | number | null>;

export async function readRecords(fileName: string): Promise<Row[]> {
  const contents = await readFile(path.join(recordsDirectory, fileName), "utf8");
  const rows = JSON.parse(contents) as Row[];
  if (fileName !== "employees.json") return rows;
  return rows.map((row) => (row.id === currentUser.id ? { ...row, name: currentUser.name } : row));
}

// The plan and the graph call this person "User". The screen shows who they are.
export const currentUser = { id: "user", name: "Sparsh Bohra", initials: "SB", email: "sparsh.bohra@fieldnote.com" };
export const manager = { name: "Alex Morgan", label: "Alex Morgan, your manager" };

export async function writeRecords(fileName: string, rows: Row[]) {
  await writeFile(path.join(recordsDirectory, fileName), `${JSON.stringify(rows, null, 2)}\n`);
}

export async function readRules(): Promise<{ discountCapPercent: number; sendQuote: string }> {
  return JSON.parse(await readFile(path.join(dataDirectory, "rules.json"), "utf8"));
}

export const modules: Record<string, { title: string; file: string; columns: string[] }> = {
  accounts: { title: "Accounts", file: "accounts.json", columns: ["name", "territoryId", "ownerId", "warehouseId", "usualOrder"] },
  contacts: { title: "Contacts", file: "contacts.json", columns: ["name", "accountId", "role"] },
  opportunities: { title: "Opportunities", file: "opportunities.json", columns: ["name", "ownerId", "stage", "amount", "discountPercent"] },
  quotes: { title: "Quotes", file: "quotes.json", columns: ["accountId", "ownerId", "status", "amount"] },
  orders: { title: "Orders", file: "orders.json", columns: ["accountId", "warehouseId", "status", "amount"] },
  invoices: { title: "Invoices", file: "invoices.json", columns: ["accountId", "orderId", "status", "amount"] },
  products: { title: "Products", file: "products.json", columns: ["name", "sku", "family", "unit", "price"] },
  "price-books": { title: "Price Books", file: "price-books.json", columns: ["name"] },
  inventory: { title: "Inventory", file: "inventory.json", columns: ["productId", "warehouseId", "onHand"] },
  warehouses: { title: "Warehouses", file: "warehouses.json", columns: ["name", "officeId", "kind"] },
  suppliers: { title: "Suppliers", file: "suppliers.json", columns: ["name", "category"] },
  "purchase-orders": { title: "Purchase Orders", file: "purchase-orders.json", columns: ["supplierId", "warehouseId", "status"] },
  shipments: { title: "Shipments", file: "shipments.json", columns: ["accountId", "warehouseId", "status"] },
  cases: { title: "Cases", file: "cases.json", columns: ["accountId", "kind", "status", "ownerId"] },
  approvals: { title: "Approvals", file: "approvals.json", columns: ["opportunityId", "requestedBy", "status"] },
  people: { title: "People", file: "employees.json", columns: ["name", "role", "department", "reportsTo", "territoryId"] },
};

export const columnLabels: Record<string, string> = {
  territoryId: "Territory",
  ownerId: "Owner",
  warehouseId: "Warehouse",
  usualOrder: "Usual order",
  accountId: "Account",
  buyerName: "Buyer",
  discountPercent: "Discount",
  orderId: "Order",
  productId: "Product",
  supplierId: "Supplier",
  opportunityId: "Opportunity",
  requestedBy: "Requested by",
  reportsTo: "Reports to",
  officeId: "Office",
  onHand: "On hand",
  unit: "Unit",
  sku: "SKU",
};

export function columnLabel(column: string) {
  return columnLabels[column] ?? column[0].toUpperCase() + column.slice(1);
}

export function money(value: string | number | null | undefined) {
  return `$${Number(value ?? 0).toLocaleString()}`;
}

export async function loadNames() {
  const files = ["employees.json", "accounts.json", "warehouses.json", "territories.json", "products.json", "suppliers.json", "offices.json", "opportunities.json"];
  const groups = await Promise.all(files.map((file) => readRecords(file)));
  const names = new Map<string, string>();
  for (const rows of groups) {
    for (const row of rows) names.set(String(row.id), String(row.name ?? row.id));
  }
  return (id: string | number | null | undefined) => names.get(String(id ?? "")) ?? (id == null || id === "" ? "—" : String(id));
}

export type RecordType = {
  file: string;
  prefix: string;
  fields: string[];
  required: string[];
  numeric: string[];
  defaults: Row;
  patchable: string[];
  deletable: boolean;
};

// The only records the CRM screens may create or change. discountPercent is not here on purpose:
// it moves only through the discount route, which is the one place the cap is enforced.
export const recordTypes: Record<string, RecordType> = {
  accounts: { file: "accounts.json", prefix: "", fields: ["name", "buyerName", "usualOrder", "territoryId", "warehouseId"], required: ["name"], numeric: [], defaults: { ownerId: "user", territoryId: "northeast", warehouseId: "jersey-city-cold" }, patchable: ["name", "buyerName", "usualOrder", "territoryId", "warehouseId", "ownerId"], deletable: true },
  contacts: { file: "contacts.json", prefix: "contact", fields: ["accountId", "name", "role"], required: ["accountId", "name"], numeric: [], defaults: { role: "buyer" }, patchable: ["name", "role", "accountId"], deletable: true },
  opportunities: { file: "opportunities.json", prefix: "opp", fields: ["name", "accountId", "stage", "amount"], required: ["accountId"], numeric: ["amount"], defaults: { ownerId: "user", stage: "Qualify", discountPercent: 0 }, patchable: ["name", "ownerId", "stage", "amount"], deletable: true },
  orders: { file: "orders.json", prefix: "order", fields: ["accountId", "warehouseId", "status", "amount"], required: ["accountId"], numeric: ["amount"], defaults: { status: "open" }, patchable: ["status", "warehouseId", "amount"], deletable: true },
  "purchase-orders": { file: "purchase-orders.json", prefix: "po", fields: ["supplierId", "warehouseId", "status"], required: ["supplierId"], numeric: [], defaults: { status: "open" }, patchable: ["status", "warehouseId"], deletable: true },
  cases: { file: "cases.json", prefix: "case", fields: ["accountId", "kind", "status"], required: ["accountId", "kind"], numeric: [], defaults: { status: "open", ownerId: "user" }, patchable: ["kind", "status", "ownerId"], deletable: true },
  activity: { file: "activity.json", prefix: "act", fields: ["opportunityId", "accountId", "text"], required: ["text"], numeric: [], defaults: {}, patchable: ["text"], deletable: true },
  approvals: { file: "approvals.json", prefix: "approval", fields: ["opportunityId", "kind"], required: ["opportunityId"], numeric: [], defaults: { requestedBy: "user", approverId: "alex-morgan", kind: "discount", status: "pending" }, patchable: [], deletable: false },
  inventory: { file: "inventory.json", prefix: "inv", fields: [], required: [], numeric: ["onHand"], defaults: {}, patchable: ["onHand"], deletable: false },
  "line-items": { file: "line-items.json", prefix: "li", fields: ["opportunityId", "productId", "quantity"], required: ["opportunityId", "productId"], numeric: ["quantity"], defaults: {}, patchable: ["quantity"], deletable: true },
};

export function slug(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function makeId(type: RecordType, values: Row, taken: Set<string>) {
  const seed = slug(String(values.name ?? values.accountId ?? values.supplierId ?? values.opportunityId ?? Date.now().toString(36)));
  const base = [type.prefix, seed].filter(Boolean).join("-");
  let id = base;
  for (let count = 2; taken.has(id); count += 1) id = `${base}-${count}`;
  return id;
}

export function tone(value: string | number | null | undefined) {
  const text = String(value ?? "").toLowerCase();
  if (["delivered", "paid", "sent", "received", "approved", "closed", "resolved"].includes(text)) return "good";
  if (["open", "pending", "in transit", "picking", "qualify"].includes(text)) return "warn";
  if (["rejected", "overdue", "late"].includes(text)) return "bad";
  return "";
}

export const nav = [
  ["/", "Home"],
  ["/accounts", "Accounts"],
  ["/pipeline", "Pipeline"],
  ["/orders", "Fulfillment"],
  ["/supply", "Supply"],
  ["/company", "Company"],
] as const;
