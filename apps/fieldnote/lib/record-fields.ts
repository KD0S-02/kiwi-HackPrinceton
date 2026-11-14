import type { Field } from "../components/ActionButton";
import { columnLabel, readRecords, type Row } from "./data";

const pickLists: Record<string, string> = {
  accountId: "accounts.json",
  warehouseId: "warehouses.json",
  territoryId: "territories.json",
  supplierId: "suppliers.json",
  productId: "products.json",
  opportunityId: "opportunities.json",
  officeId: "offices.json",
  ownerId: "employees.json",
};

const fixedChoices: Record<string, string[]> = {
  stage: ["Qualify", "Proposal", "Commit", "Closed Won"],
  kind: ["delivery complaint", "missing item", "billing question"],
};

export async function choiceLists() {
  const files = [...new Set(Object.values(pickLists))];
  const loaded = await Promise.all(files.map((file) => readRecords(file)));
  const byFile = new Map(files.map((file, index) => [file, loaded[index]]));
  return (column: string, rows: Row[] = []) => {
    const file = pickLists[column];
    if (file) {
      const options = byFile.get(file) ?? [];
      const people = column === "ownerId" ? options.filter((row) => row.department === "sales") : options;
      return people.map((row) => ({ value: String(row.id), label: String(row.name) }));
    }
    const values = fixedChoices[column] ?? [...new Set(rows.map((row) => row[column]).filter((value) => value != null && value !== ""))].map(String).sort();
    return values.map((value) => ({ value, label: value }));
  };
}

export type Choices = Awaited<ReturnType<typeof choiceLists>>;

export function formFields(columns: string[], choices: Choices, rows: Row[], row?: Row): Field[] {
  return columns.map((column) => {
    const value = row ? String(row[column] ?? "") : undefined;
    const label = columnLabel(column);
    if (column === "text") return { name: column, label, type: "textarea", value };
    if (["amount", "quantity", "onHand", "price", "reorderPoint", "reorderQty"].includes(column)) return { name: column, label, type: "number", value };
    if (pickLists[column] || fixedChoices[column] || ["status", "role", "category", "family", "department"].includes(column)) {
      const options = choices(column, rows);
      if (options.length > 0) return { name: column, label, type: "select", value, options };
    }
    return { name: column, label, value };
  });
}
