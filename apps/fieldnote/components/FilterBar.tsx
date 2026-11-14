"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";
import type { FilterDef, FilterOption } from "../lib/filters";

type Props = {
  path: string;
  filters: (FilterDef & { choices: FilterOption[] })[];
  values: Record<string, string>;
  shown: number;
  total: number;
  noun: string;
  keep?: Record<string, string>;
};

export function FilterBar({ path, filters, values, shown, total, noun, keep = {} }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState(values);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => setDraft(values), [JSON.stringify(values)]);
  useEffect(() => () => clearTimeout(timer.current), []);

  function go(next: Record<string, string>) {
    const params = new URLSearchParams(keep);
    for (const filter of filters) {
      const value = (next[filter.name] ?? "").trim();
      if (value) params.set(filter.name, value);
    }
    const query = params.toString();
    router.replace(query ? `${path}?${query}` : path, { scroll: false });
  }

  function change(name: string, value: string, wait: number) {
    const next = { ...draft, [name]: value };
    setDraft(next);
    clearTimeout(timer.current);
    if (wait === 0) go(next);
    else timer.current = setTimeout(() => go(next), wait);
  }

  const active = filters.filter((filter) => {
    const value = values[filter.name] ?? "";
    return value !== "" && value !== filter.fallback;
  });
  const focusFilter = active[0]?.name;

  return (
    <form
      className="filter-bar"
      data-kiwi={focusFilter ? undefined : "filters"}
      onSubmit={(event) => {
        event.preventDefault();
        clearTimeout(timer.current);
        go(draft);
      }}
    >
      <Icon name="filter" size={15} />
      {filters.map((filter) => {
        const id = `filter-${filter.name}`;
        const kiwi = filter.name === focusFilter ? "filters" : undefined;
        if (filter.kind === "select") {
          return (
            <select key={filter.name} id={id} data-kiwi={kiwi} aria-label={filter.label} value={draft[filter.name] ?? ""} onChange={(event) => change(filter.name, event.target.value, 0)}>
              <option value={filter.fallback ? "all" : ""}>{filter.all ?? `Any ${filter.label.toLowerCase()}`}</option>
              {filter.choices.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          );
        }
        return (
          <input
            key={filter.name}
            id={id}
            data-kiwi={kiwi}
            aria-label={filter.label}
            type={filter.kind === "number" ? "number" : "search"}
            className={filter.kind === "number" ? "narrow" : ""}
            placeholder={filter.placeholder ?? filter.label}
            value={draft[filter.name] ?? ""}
            onChange={(event) => change(filter.name, event.target.value, 350)}
          />
        );
      })}
      <span className="filter-count" id="filter-count">{shown === total ? `${total} ${noun}` : `${shown} of ${total} ${noun}`}</span>
      {active.length > 0 ? (
        <button type="button" className="btn ghost small" id="clear-filters" onClick={() => { setDraft({}); go({}); }}>
          <Icon name="x" size={13} />
          Clear filters
        </button>
      ) : null}
    </form>
  );
}
