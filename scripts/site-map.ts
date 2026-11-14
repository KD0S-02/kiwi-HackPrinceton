import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { listFilterColumns, optionsFor, pageFilters, type FilterFiles } from "../apps/fieldnote/lib/filters.ts";

const recordsDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data/records");

type Row = Record<string, string | number | null>;

function read(file: string): Row[] {
  return JSON.parse(readFileSync(path.join(recordsDirectory, file), "utf8")) as Row[];
}

// Generic list pages and the columns they filter on. Mirrors `modules` in apps/fieldnote/lib/data.ts.
const lists: [string, string, string, string[]][] = [
  ["/contacts", "contacts.json", "buyers at each restaurant", ["accountId"]],
  ["/quotes", "quotes.json", "quotes sent", ["status", "ownerId", "accountId"]],
  ["/approvals", "approvals.json", "discount approvals for Alex Morgan", ["status"]],
  ["/invoices", "invoices.json", "invoices", ["status", "accountId"]],
  ["/shipments", "shipments.json", "shipments", ["status", "warehouseId", "accountId"]],
  ["/cases", "cases.json", "support cases", ["status", "kind", "ownerId", "accountId"]],
  ["/products", "products.json", "the product catalog", ["family"]],
  ["/suppliers", "suppliers.json", "suppliers", ["category"]],
  ["/purchase-orders", "purchase-orders.json", "purchase orders", ["status", "supplierId", "warehouseId"]],
  ["/inventory", "inventory.json", "every stock line", ["warehouseId", "productId"]],
  ["/warehouses", "warehouses.json", "warehouses", ["kind", "officeId"]],
  ["/people", "employees.json", "the company roster", ["role", "department", "territoryId"]],
];

export function siteMap() {
  const files: FilterFiles = {
    employees: read("employees.json").map((row) => (row.id === "user" ? { ...row, name: "Sparsh Bohra" } : row)),
    territories: read("territories.json"),
    warehouses: read("warehouses.json"),
    products: read("products.json"),
    suppliers: read("suppliers.json"),
  };
  const names = new Map<string, string>();
  for (const file of ["employees.json", "accounts.json", "warehouses.json", "territories.json", "suppliers.json", "offices.json", "products.json"]) {
    for (const row of read(file)) names.set(String(row.id), row.id === "user" ? "Sparsh Bohra" : String(row.name ?? row.id));
  }

  const lines = [
    "SITE MAP. every Fieldnote list keeps its filters in the URL. leave a param out to mean any. pick the list that holds the records asked about: cases are on /cases, invoices on /invoices, people on /people, products on /products. unpaid means status=open.",
  ];
  for (const page of pageFilters) {
    const params = page.filters.map((filter) => {
      if (filter.kind === "search") return `${filter.name}=<text>`;
      if (filter.kind === "number") return `${filter.name}=<number> (${filter.label.toLowerCase()})`;
      const options = optionsFor(filter, files).map((option) => (option.value === option.label ? option.value : `${option.value} (${option.label})`));
      const everyone = filter.fallback ? ` default ${filter.fallback}, all for everyone,` : "";
      return `${filter.name}=${options.join("|")}${everyone}`;
    });
    lines.push(`${page.path} ${page.about}. ${params.join("; ")}`);
  }
  for (const [route, file, about, columns] of lists) {
    const rows = read(file);
    const params = columns.filter((column) => listFilterColumns.includes(column)).map((column) => {
      const values = [...new Set(rows.map((row) => String(row[column] ?? "")).filter(Boolean))];
      if (values.length > 8) return `${column}=<id>`;
      return `${column}=${values.map((value) => (names.has(value) ? `${value} (${names.get(value)})` : value)).join("|")}`;
    });
    lines.push(`${route} ${about}. q=<text>; ${params.join("; ")}`);
  }
  lines.push(
    "BUTTONS. /accounts: New account, Import, Export, Edit, Delete. /accounts/<account id>: Edit, Follow, Log activity, Add buyer, Delete.",
    "/pipeline: New opportunity, Edit, Delete. /opportunities/<id>: discount field, Save discount, Send Quote (send-quote), Clone, Change owner, Add product, Edit line, Log activity, Request approval, Delete.",
    "/orders: New order, New case, Export, Edit, Delete, case status. /supply: Cycle count, New purchase order, Export stock, Count on each stock row, Edit and Delete on purchase orders.",
    "every other list: New, Export, Open, Edit, Delete. /company: Roster, Export roster. /profile: Log out.",
  );
  lines.push("account ids are the restaurant name in kebab case, like harbor-diner. deal pages are /opportunities/opp-<account id>. account pages are /accounts/<account id>.");
  lines.push("home is /. the sidebar Fieldnote logo is the control id brand. click brand to go home.");
  lines.push("setting a discount is three stops in one finish: url:/opportunities/opp-<account id>, type target discount text <number>, click target save-discount.");
  return lines.join("\n");
}
