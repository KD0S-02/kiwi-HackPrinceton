import { columnLabel, loadNames, modules, readRecords } from "../../../../lib/data";

function cell(value: string) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export async function GET(_request: Request, context: { params: Promise<{ name: string }> }) {
  const { name } = await context.params;
  const config = modules[name];
  if (!config) return new Response("Unknown export.", { status: 404 });
  const [rows, nameOf] = await Promise.all([readRecords(config.file), loadNames()]);
  const lines = [config.columns.map((column) => cell(columnLabel(column))).join(",")];
  for (const row of rows) {
    lines.push(
      config.columns
        .map((column) => {
          const value = row[column];
          const resolved = column.endsWith("Id") || column === "reportsTo" || column === "requestedBy" ? nameOf(value) : String(value ?? "");
          return cell(resolved);
        })
        .join(","),
    );
  }
  return new Response(`${lines.join("\n")}\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="fieldnote-${name}.csv"`,
    },
  });
}
