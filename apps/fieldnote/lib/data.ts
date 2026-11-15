import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const dataDirectory = path.resolve(process.cwd(), "../../data");
export const recordsDirectory = path.join(dataDirectory, "records");

export type Row = Record<string, string | number | null>;

// A record file that does not exist yet reads as empty, so a new workflow file never crashes a page.
export async function readRecords(fileName: string): Promise<Row[]> {
  let contents: string;
  try {
    contents = await readFile(path.join(recordsDirectory, fileName), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
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

export type Rules = {
  discountCapPercent: number;
  sendQuote: string;
  creditApprovalOverDollars: number;
  paymentPlanApprovalOverDollars: number;
  paymentPlanMaxInstallmentsWithoutApproval: number;
  purchaseOrderApprovalOverDollars: number;
  autoCreditLimitDollars: number;
  holdAfterDaysPastDue: number;
  quoteValidDays: number;
  financeApproverId: string;
  deliveryDays: Record<string, string>;
  warehouseFamilies: Record<string, string>;
};

// Defaults keep every page working even if rules.json still has only the original two keys.
const ruleDefaults: Rules = {
  discountCapPercent: 15,
  sendQuote: "own opportunities",
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

export async function readRules(): Promise<Rules> {
  const stored = JSON.parse(await readFile(path.join(dataDirectory, "rules.json"), "utf8")) as Partial<Rules>;
  return { ...ruleDefaults, ...stored };
}

export const modules: Record<string, { title: string; file: string; columns: string[] }> = {
  accounts: { title: "Accounts", file: "accounts.json", columns: ["name", "status", "territoryId", "ownerId", "warehouseId"] },
  contacts: { title: "Contacts", file: "contacts.json", columns: ["name", "accountId", "role", "email"] },
  opportunities: { title: "Opportunities", file: "opportunities.json", columns: ["name", "ownerId", "stage", "amount", "discountPercent"] },
  quotes: { title: "Quotes", file: "quotes.json", columns: ["accountId", "version", "ownerId", "status", "amount"] },
  orders: { title: "Orders", file: "orders.json", columns: ["accountId", "warehouseId", "status", "deliveryDate", "amount"] },
  invoices: { title: "Invoices", file: "invoices.json", columns: ["accountId", "orderId", "status", "dueDate", "amount"] },
  "credit-memos": { title: "Credit Memos", file: "credit-memos.json", columns: ["accountId", "invoiceId", "status", "quantity", "amount"] },
  payments: { title: "Payments", file: "payments.json", columns: ["accountId", "invoiceId", "method", "reference", "amount"] },
  "payment-plans": { title: "Payment Plans", file: "payment-plans.json", columns: ["accountId", "invoiceId", "status", "installments", "total"] },
  "credit-applications": { title: "Credit Applications", file: "credit-applications.json", columns: ["accountId", "status", "requestedLimit", "approvedLimit"] },
  products: { title: "Products", file: "products.json", columns: ["name", "sku", "family", "unit", "price"] },
  "price-books": { title: "Price Books", file: "price-books.json", columns: ["name"] },
  inventory: { title: "Inventory", file: "inventory.json", columns: ["productId", "warehouseId", "onHand", "reorderPoint"] },
  warehouses: { title: "Warehouses", file: "warehouses.json", columns: ["name", "officeId", "kind"] },
  suppliers: { title: "Suppliers", file: "suppliers.json", columns: ["name", "category", "minOrderDollars", "leadDays"] },
  "purchase-orders": { title: "Purchase Orders", file: "purchase-orders.json", columns: ["supplierId", "warehouseId", "status", "total"] },
  shipments: { title: "Shipments", file: "shipments.json", columns: ["accountId", "warehouseId", "status", "deliveryDate"] },
  cases: { title: "Cases", file: "cases.json", columns: ["accountId", "kind", "status", "ownerId"] },
  approvals: { title: "Approvals", file: "approvals.json", columns: ["kind", "subjectId", "requestedBy", "approverId", "status"] },
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
  approvedDiscountPercent: "Approved discount",
  orderId: "Order",
  invoiceId: "Invoice",
  shipmentId: "Shipment",
  quoteId: "Quote",
  caseId: "Case",
  productId: "Product",
  supplierId: "Supplier",
  opportunityId: "Opportunity",
  subjectId: "Subject",
  subjectType: "Subject type",
  requestedBy: "Requested by",
  approverId: "Approver",
  decidedBy: "Decided by",
  reportsTo: "Reports to",
  officeId: "Office",
  onHand: "On hand",
  reorderPoint: "Reorder point",
  reorderQty: "Reorder qty",
  unit: "Unit",
  sku: "SKU",
  deliveryDate: "Delivery",
  dueDate: "Due",
  issuedAt: "Issued",
  minOrderDollars: "Minimum order",
  leadDays: "Lead days",
  requestedLimit: "Requested",
  approvedLimit: "Approved",
  creditLimit: "Credit limit",
  priceBookId: "Price book",
  deliveryDays: "Delivery days",
  taxStatus: "Tax status",
};

export function columnLabel(column: string) {
  return columnLabels[column] ?? column[0].toUpperCase() + column.slice(1).replace(/([A-Z])/g, " $1").toLowerCase();
}

// Whole dollars show without cents; anything with cents shows two places.
export function money(value: string | number | null | undefined) {
  const amount = Number(value ?? 0);
  const cents = Math.round(amount * 100) % 100 !== 0;
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 })}`;
}

export function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export async function loadNames() {
  const files = ["employees.json", "accounts.json", "warehouses.json", "territories.json", "products.json", "suppliers.json", "offices.json", "opportunities.json", "price-books.json"];
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

// The only records the CRM screens may create or change. Status, money and stock are not patchable:
// they move only through workflow actions (/api/actions/<name>), which enforce the rules.
// discountPercent moves only through the discount route, which is the one place the cap is enforced.
export const recordTypes: Record<string, RecordType> = {
  accounts: { file: "accounts.json", prefix: "", fields: ["name", "buyerName", "usualOrder", "zip"], required: ["name"], numeric: [], defaults: { ownerId: "user" }, patchable: ["name", "buyerName", "usualOrder", "territoryId", "warehouseId", "ownerId"], deletable: true },
  contacts: { file: "contacts.json", prefix: "contact", fields: ["accountId", "name", "role", "email", "phone"], required: ["accountId", "name"], numeric: [], defaults: { role: "buyer" }, patchable: ["name", "role", "email", "phone"], deletable: true },
  opportunities: { file: "opportunities.json", prefix: "opp", fields: ["name", "accountId", "stage", "amount"], required: ["accountId"], numeric: ["amount"], defaults: { ownerId: "user", stage: "Qualify", discountPercent: 0 }, patchable: ["name", "ownerId", "stage", "amount"], deletable: true },
  orders: { file: "orders.json", prefix: "order", fields: ["accountId", "warehouseId", "amount", "deliveryDate"], required: ["accountId", "amount"], numeric: ["amount"], defaults: { status: "open" }, patchable: ["warehouseId"], deletable: true },
  "purchase-orders": { file: "purchase-orders.json", prefix: "po", fields: ["supplierId", "warehouseId"], required: ["supplierId", "warehouseId"], numeric: [], defaults: { status: "draft", total: 0 }, patchable: ["warehouseId"], deletable: true },
  cases: { file: "cases.json", prefix: "case", fields: ["accountId", "kind", "subject"], required: ["accountId", "kind"], numeric: [], defaults: { status: "open", ownerId: "user" }, patchable: ["kind", "subject", "ownerId"], deletable: true },
  activity: { file: "activity.json", prefix: "act", fields: ["opportunityId", "accountId", "subjectType", "subjectId", "kind", "outcome", "text"], required: ["text"], numeric: [], defaults: { kind: "note" }, patchable: ["text"], deletable: true },
  approvals: { file: "approvals.json", prefix: "approval", fields: ["opportunityId", "kind", "note"], required: ["opportunityId"], numeric: [], defaults: { requestedBy: "user", approverId: "", kind: "discount", status: "pending" }, patchable: [], deletable: false },
  inventory: { file: "inventory.json", prefix: "inv", fields: [], required: [], numeric: ["onHand", "reorderPoint", "reorderQty"], defaults: {}, patchable: ["onHand", "reorderPoint", "reorderQty"], deletable: false },
  "line-items": { file: "line-items.json", prefix: "li", fields: ["opportunityId", "productId", "quantity"], required: ["opportunityId", "productId", "quantity"], numeric: ["quantity"], defaults: {}, patchable: ["quantity"], deletable: true },
};

export function slug(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Two restaurants can share a name. The ZIP tells them apart, and one that cannot ship is marked.
export function restaurantChoice(row: Row) {
  const ready = row.status === "active" && row.warehouseId;
  const zip = row.zip ? ` · ${row.zip}` : "";
  return { value: String(row.id), label: `${row.name}${zip}${ready ? "" : " · not set up"}` };
}

export function makeId(type: RecordType, values: Row, taken: Set<string>) {
  const seed = slug(String(values.name ?? values.accountId ?? values.supplierId ?? values.opportunityId ?? Date.now().toString(36)));
  const base = [type.prefix, seed].filter(Boolean).join("-");
  let id = base;
  for (let count = 2; taken.has(id); count += 1) id = `${base}-${count}`;
  return id;
}

// The next "<prefix>-<n>" id, for rows numbered like order-16 or case-13.
export function nextNumberedId(prefix: string, rows: Row[]) {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  const highest = rows.reduce((max, row) => {
    const match = pattern.exec(String(row.id));
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `${prefix}-${highest + 1}`;
}

const goodWords = ["delivered", "paid", "received", "approved", "closed", "resolved", "posted", "active", "accepted", "converted", "completed", "closed won", "sent"];
const warnWords = ["open", "pending", "pending approval", "in transit", "picking", "qualify", "investigating", "scheduled", "partially received", "onboarding", "applied", "draft"];
const badWords = ["rejected", "overdue", "late", "held", "backordered", "declined", "past due", "on hold"];
const grayWords = ["superseded", "cancelled"];

export function tone(value: string | number | null | undefined) {
  const text = String(value ?? "").toLowerCase();
  if (goodWords.includes(text)) return "good";
  if (warnWords.includes(text)) return "warn";
  if (badWords.includes(text)) return "bad";
  if (grayWords.includes(text)) return "gray";
  return "";
}

// "Today" is the real clock, as a YYYY-MM-DD string in local time.
export function today(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function addDays(day: string, count: number) {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + count);
  return today(date);
}

export function daysBetween(from: string, to: string) {
  return Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86400000);
}

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function dayName(day: string) {
  return dayNames[new Date(`${day}T12:00:00`).getDay()];
}

export function prettyDate(day: string | number | null | undefined) {
  if (!day) return "—";
  const text = String(day);
  const date = new Date(text.length === 10 ? `${text}T12:00:00` : text);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleDateString("en-US", { weekday: text.length === 10 ? "short" : undefined, month: "short", day: "numeric", year: "numeric" });
}

export const nav = [
  ["/", "Home"],
  ["/accounts", "Accounts"],
  ["/pipeline", "Pipeline"],
  ["/orders", "Fulfillment"],
  ["/supply", "Supply"],
  ["/company", "Company"],
] as const;
