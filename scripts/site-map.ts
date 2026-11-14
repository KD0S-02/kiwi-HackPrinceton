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

const fixedPages = ["/", "/accounts", "/pipeline", "/orders", "/supply", "/company", "/profile", "/search"];

// True when Fieldnote has a page at this path. Query strings do not matter.
export function knownPath(target: string) {
  const route = (target.split(/[?#]/)[0] || "/").replace(/\/+$/, "") || "/";
  if (fixedPages.includes(route)) return true;
  if (/^\/(accounts|opportunities)\/[a-z0-9-]+$/.test(route)) return true;
  return lists.some(([list]) => route === list || new RegExp(`^${list}/[a-z0-9-]+$`).test(route));
}

const placeNames: [string, string][] = [
  ["Accounts", "/accounts"],
  ["Pipeline", "/pipeline"],
  ["Fulfillment", "/orders"],
  ["Orders", "/orders"],
  ["Supply", "/supply"],
  ["Company", "/company"],
  ...lists.map(([route]) => [route.slice(1).replace(/-/g, " ").replace(/^./, (letter) => letter.toUpperCase()), route] as [string, string]),
];

// Real Fieldnote pages named in a sentence, in the order they appear.
export function placesIn(text: string) {
  let rest = text.toLowerCase();
  const found: { name: string; path: string; at: number }[] = [];
  for (const [name, route] of [...placeNames].sort((a, b) => b[0].length - a[0].length)) {
    const match = new RegExp(`\\b${name.toLowerCase().replace(/s$/, "")}s?\\b`).exec(rest);
    if (!match) continue;
    rest = rest.slice(0, match.index) + " ".repeat(match[0].length) + rest.slice(match.index + match[0].length);
    if (!found.some((place) => place.path === route)) found.push({ name, path: route, at: match.index });
  }
  return found.sort((a, b) => a.at - b.at).map(({ name, path: route }) => ({ name, path: route }));
}

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
  lines.push("adding a restaurant he named does not stop when New account opens. the open dialog fields are new-account-name, new-account-buyerName, new-account-zip, and new-account-usualOrder. Create account is new-account-submit. type the name, type the ZIP when he gave one, then click new-account-submit. without a ZIP, type the name and ask for it.");
  return lines.join("\n");
}
