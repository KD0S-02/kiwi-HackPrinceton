import { readRecords, readRules, writeRecords, type Row, type Rules } from "../data";

// One unit of work over the JSON records. Files load once, are changed in memory, and only the
// files whose contents actually changed are written back by save(). A refused action never calls
// save(), so a refusal leaves every file exactly as it was.
export type Db = {
  rows(file: string): Promise<Row[]>;
  rules(): Promise<Rules>;
  name(id: unknown): Promise<string>;
  save(): Promise<void>;
};

const nameFiles = ["employees.json", "accounts.json", "warehouses.json", "territories.json", "products.json", "suppliers.json", "price-books.json", "contacts.json"];

export function openDb(): Db {
  const cache = new Map<string, { rows: Row[]; original: string }>();
  let rules: Rules | undefined;

  async function rows(file: string) {
    const cached = cache.get(file);
    if (cached) return cached.rows;
    const loaded = await readRecords(file);
    cache.set(file, { rows: loaded, original: JSON.stringify(loaded) });
    return loaded;
  }

  return {
    rows,
    async rules() {
      rules ??= await readRules();
      return rules;
    },
    async name(id: unknown) {
      const key = String(id ?? "");
      if (!key) return "—";
      for (const file of nameFiles) {
        const found = (await rows(file)).find((row) => row.id === key);
        if (found) return String(found.name ?? key);
      }
      return key;
    },
    async save() {
      for (const [file, entry] of cache) {
        if (JSON.stringify(entry.rows) !== entry.original) {
          await writeRecords(file, entry.rows);
          entry.original = JSON.stringify(entry.rows);
        }
      }
    },
  };
}

export async function find(db: Db, file: string, id: unknown) {
  return (await db.rows(file)).find((row) => row.id === String(id ?? ""));
}

export function num(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function text(value: unknown) {
  return value == null ? "" : String(value).trim();
}
