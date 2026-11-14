import { notFound } from "next/navigation";
import { ActionButton } from "../../../components/ActionButton";
import { DeleteButton } from "../../../components/DeleteButton";
import { ExportLink } from "../../../components/ExportLink";
import { FilterBar } from "../../../components/FilterBar";
import { columnLabel, loadNames, modules, readRecords, recordTypes, type Row } from "../../../lib/data";
import { listFilterColumns, textMatches } from "../../../lib/filters";
import { choiceLists, formFields } from "../../../lib/record-fields";

export const dynamic = "force-dynamic";

export default async function ModuleListPage({
  params,
  searchParams,
}: {
  params: Promise<{ module: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { module: moduleKey } = await params;
  const query = await searchParams;
  const moduleConfig = modules[moduleKey];
  if (!moduleConfig) notFound();
  const [all, nameOf, choices] = await Promise.all([readRecords(moduleConfig.file), loadNames(), choiceLists()]);
  const type = recordTypes[moduleKey];

  const filterColumns = listFilterColumns.filter((column) => moduleConfig.columns.includes(column));
  const filters = [
    { name: "q", label: "Search", kind: "search" as const, placeholder: `Search ${moduleConfig.title.toLowerCase()}`, choices: [] },
    ...filterColumns.map((column) => ({
      name: column,
      label: columnLabel(column),
      kind: "select" as const,
      all: `Any ${columnLabel(column).toLowerCase()}`,
      choices: [...new Set(all.map((row) => String(row[column] ?? "")).filter(Boolean))]
        .map((value) => ({ value, label: column.endsWith("Id") ? nameOf(value) : value }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    })),
  ];
  const values = Object.fromEntries(filters.map((filter) => [filter.name, String(query[filter.name] ?? "")]));
  const rows = all.filter((row) =>
    filterColumns.every((column) => !values[column] || String(row[column]) === values[column])
    && textMatches(values.q, Object.entries(row).flatMap(([key, value]) => (key.endsWith("Id") ? [value, nameOf(value)] : [value]))));

  return (
    <section>
      <div className="page-head">
        <div>
          <div className="crumb">Fieldnote / {moduleConfig.title}</div>
          <h1>{moduleConfig.title}</h1>
        </div>
        <div className="actions">
          <ExportLink name={moduleKey} />
          {type && type.fields.length > 0 ? (
            <ActionButton
              variant="primary"
              icon="plus"
              label={`New ${singular(moduleConfig.title)}`}
              title={`New ${singular(moduleConfig.title)}`}
              endpoint={`/api/records/${moduleKey}`}
              submit="Create"
              fields={formFields(type.fields, choices, all).map((field) => (type.required.includes(field.name) ? { ...field, required: true } : field))}
            />
          ) : null}
        </div>
      </div>
      <div className="panel" data-kiwi="results">
        <FilterBar path={`/${moduleKey}`} filters={filters} values={values} shown={rows.length} total={all.length} noun={moduleConfig.title.toLowerCase()} />
        {rows.length === 0 ? <p className="empty">Nothing matches those filters.</p> : (
          <div className="scroll tall">
            <table>
              <thead>
                <tr>
                  {moduleConfig.columns.map((column) => <th key={column}>{columnLabel(column)}</th>)}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={String(row.id)}>
                    {moduleConfig.columns.map((column) => <td key={column}>{cell(moduleKey, column, row, nameOf)}</td>)}
                    <td>
                      <div className="row-actions">
                        <a className="btn ghost small" href={detailHref(moduleKey, row)}>Open</a>
                        {type && type.patchable.length > 0 ? (
                          <ActionButton
                            small
                            icon="edit"
                            label="Edit"
                            title={`Edit ${String(row.name ?? row.id)}`}
                            endpoint={`/api/records/${moduleKey}/${row.id}`}
                            method="PATCH"
                            fields={formFields(type.patchable, choices, all, row)}
                          />
                        ) : null}
                        {type?.deletable ? <DeleteButton small endpoint={`/api/records/${moduleKey}/${row.id}`} name={String(row.name ?? row.id)} /> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function singular(title: string) {
  const word = title.toLowerCase();
  if (word === "people") return "person";
  if (word === "inventory") return "stock line";
  return word.endsWith("ies") ? `${word.slice(0, -3)}y` : word.replace(/s$/, "");
}

function detailHref(moduleKey: string, row: Row) {
  if (moduleKey === "opportunities") return `/opportunities/${row.id}`;
  if (moduleKey === "accounts") return `/accounts/${row.id}`;
  return `/${moduleKey}/${row.id}`;
}

function cell(moduleKey: string, column: string, row: Row, nameOf: (id: Row[string]) => string) {
  const value = row[column];
  if (column.endsWith("Id") || column === "reportsTo" || column === "requestedBy") return nameOf(value);
  if (column === "name") return <a href={detailHref(moduleKey, row)}>{value}</a>;
  if (column === "status" || column === "stage") {
    const tone = value === "open" || value === "pending" ? "warn" : value === "delivered" || value === "paid" || value === "sent" || value === "closed" ? "good" : "";
    return <span className={`pill ${tone}`}>{value}</span>;
  }
  if (column === "discountPercent") {
    return <span className={Number(value) > 15 ? "pill bad" : "pill good"}>{value}%</span>;
  }
  if (column === "amount" || column === "price") return `$${Number(value).toLocaleString()}`;
  return String(value ?? "");
}
