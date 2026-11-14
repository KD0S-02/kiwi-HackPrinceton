// Every list filter lives in the URL, so a link like /pipeline?stage=Proposal&owner=all
// opens the page already filtered. Kiwi reads these same definitions to build those links.

type Row = Record<string, string | number | null>;

export type FilterOption = { value: string; label: string };

export type FilterDef = {
  name: string;
  label: string;
  kind: "search" | "select" | "number";
  placeholder?: string;
  all?: string;
  options?: FilterOption[];
  source?: "owners" | "territories" | "warehouses" | "families" | "suppliers" | "accounts";
  fallback?: string;
};

export type PageFilters = { path: string; title: string; about: string; filters: FilterDef[] };

export const pageFilters: PageFilters[] = [
  {
    path: "/accounts",
    title: "Accounts",
    about: "restaurant accounts only (for buyers use /contacts)",
    filters: [
      { name: "q", label: "Search", kind: "search", placeholder: "Search name, buyer, usual order" },
      { name: "owner", label: "Owner", kind: "select", all: "Everyone", source: "owners" },
      { name: "territory", label: "Territory", kind: "select", all: "All territories", source: "territories" },
      { name: "warehouse", label: "Warehouse", kind: "select", all: "All warehouses", source: "warehouses" },
    ],
  },
  {
    path: "/pipeline",
    title: "Pipeline",
    about: "deals (opportunities) only",
    filters: [
      { name: "q", label: "Search", kind: "search", placeholder: "Search deals" },
      { name: "stage", label: "Stage", kind: "select", all: "All stages", options: ["Qualify", "Proposal", "Commit"].map((value) => ({ value, label: value })) },
      { name: "owner", label: "Owner", kind: "select", all: "Everyone", source: "owners", fallback: "mine" },
      { name: "discount", label: "Discount", kind: "select", all: "Any discount", options: [{ value: "over", label: "Over the 15% cap" }, { value: "within", label: "Within the cap" }] },
      { name: "min", label: "Amount at least", kind: "number", placeholder: "Min $" },
    ],
  },
  {
    path: "/orders",
    title: "Fulfillment",
    about: "customer orders only. it cannot filter invoices, shipments or cases; those have their own lists",
    filters: [
      { name: "q", label: "Search", kind: "search", placeholder: "Search restaurant or order" },
      { name: "status", label: "Status", kind: "select", all: "All statuses", options: [{ value: "open", label: "Open" }, { value: "delivered", label: "Delivered" }] },
      { name: "warehouse", label: "Warehouse", kind: "select", all: "All warehouses", source: "warehouses" },
      { name: "min", label: "Amount at least", kind: "number", placeholder: "Min $" },
    ],
  },
  {
    path: "/supply",
    title: "Supply",
    about: "stock lines on hand (product × warehouse). for the catalog use /products",
    filters: [
      { name: "q", label: "Search", kind: "search", placeholder: "Search product or SKU" },
      { name: "warehouse", label: "Warehouse", kind: "select", all: "All warehouses", source: "warehouses" },
      { name: "family", label: "Family", kind: "select", all: "All families", source: "families" },
      { name: "stock", label: "Stock", kind: "select", all: "Any stock", options: [{ value: "low", label: "Under 30 units" }, { value: "ok", label: "30 or more" }] },
    ],
  },
];

export type FilterFiles = Partial<Record<"employees" | "territories" | "warehouses" | "products" | "suppliers" | "accounts", Row[]>>;

export function optionsFor(filter: FilterDef, files: FilterFiles): FilterOption[] {
  if (filter.options) return filter.options;
  const named = (rows: Row[] = []) => rows.map((row) => ({ value: String(row.id), label: String(row.name) }));
  switch (filter.source) {
    case "owners":
      return [
        { value: "mine", label: "Only mine" },
        ...(files.employees ?? [])
          .filter((row) => row.role === "account executive" && row.id !== "user")
          .map((row) => ({ value: String(row.id), label: String(row.name) })),
      ];
    case "territories":
      return named(files.territories);
    case "warehouses":
      return named(files.warehouses);
    case "suppliers":
      return named(files.suppliers);
    case "accounts":
      return named(files.accounts);
    case "families":
      return [...new Set((files.products ?? []).map((row) => String(row.family)))].sort().map((value) => ({ value, label: value }));
    default:
      return [];
  }
}

export function filtersFor(path: string) {
  return pageFilters.find((page) => page.path === path)?.filters ?? [];
}

// Generic list pages (/contacts, /cases, /invoices ...) filter on any of these columns.
export const listFilterColumns = ["status", "stage", "kind", "family", "category", "role", "department", "ownerId", "accountId", "warehouseId", "territoryId", "supplierId", "officeId"];

export function ownerMatches(ownerId: unknown, owner: string) {
  if (!owner || owner === "all") return true;
  if (owner === "mine") return ownerId === "user";
  return ownerId === owner;
}

export function textMatches(needle: string, values: unknown[]) {
  const wanted = needle.trim().toLowerCase();
  if (!wanted) return true;
  return values.some((value) => String(value ?? "").toLowerCase().includes(wanted));
}
