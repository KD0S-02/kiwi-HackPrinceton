import { readRecords } from "./data";
import { filtersFor, optionsFor, type FilterFiles } from "./filters";
import { signedInUser } from "./session";

export async function filterFiles(): Promise<FilterFiles> {
  const [employees, territories, warehouses, products, suppliers] = await Promise.all([
    readRecords("employees.json"),
    readRecords("territories.json"),
    readRecords("warehouses.json"),
    readRecords("products.json"),
    readRecords("suppliers.json"),
  ]);
  return { employees, territories, warehouses, products, suppliers };
}

export async function loadFilters(path: string, params: Record<string, string | string[] | undefined>) {
  const [files, person] = await Promise.all([filterFiles(), signedInUser()]);
  const filters = filtersFor(path).map((filter) => ({ ...filter, choices: optionsFor(filter, files, person) }));
  const values: Record<string, string> = {};
  for (const filter of filters) {
    const raw = params[filter.name];
    const value = String(Array.isArray(raw) ? raw[0] : raw ?? "").trim();
    values[filter.name] = value || filter.fallback || "";
  }
  return { filters, values };
}
