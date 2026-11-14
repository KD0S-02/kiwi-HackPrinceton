"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon, type IconName } from "./Icon";

export type Field = {
  name: string;
  label: string;
  type?: "text" | "number" | "select" | "textarea";
  options?: { value: string; label: string }[];
  value?: string;
  required?: boolean;
  placeholder?: string;
  hint?: string;
};

type Props = {
  label: string;
  title: string;
  endpoint: string;
  method?: "POST" | "PATCH";
  fields: Field[];
  icon?: IconName;
  variant?: "primary" | "ghost";
  description?: string;
  hidden?: Record<string, string | number>;
  submit?: string;
  redirect?: string;
  csv?: boolean;
  success?: string;
  small?: boolean;
};

function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((cell) => cell.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((cell) => cell.trim());
    return Object.fromEntries(header.map((name, index) => [name, cells[index] ?? ""]));
  });
}

export function ActionButton(props: Props) {
  const router = useRouter();
  const initial = Object.fromEntries(props.fields.map((field) => [field.name, field.value ?? field.options?.[0]?.value ?? ""]));
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  function openDialog() {
    setValues(initial);
    setError("");
    setOpen(true);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const url = props.endpoint.replace(/\{(\w+)\}/g, (_match, key: string) => values[key] ?? "");
      const payload = props.csv
        ? { rows: parseCsv(values.csv ?? "").map((row) => ({ ...row, ...props.hidden })) }
        : { values: { ...values, ...props.hidden } };
      if (props.csv && payload.rows?.length === 0) throw new Error("Add a header row, then at least one data row.");
      const response = await fetch(url, {
        method: props.method ?? "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await response.json().catch(() => ({}))) as { id?: string; count?: number; error?: string };
      if (!response.ok) throw new Error(json.error ?? "That did not save.");
      setOpen(false);
      setToast(props.csv ? `Imported ${json.count ?? 0} rows.` : props.success ?? "Saved.");
      if (props.redirect && json.id) router.push(props.redirect.replace("{id}", json.id));
      else router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  const variant = props.variant ?? "ghost";
  return (
    <>
      <button type="button" className={`btn ${variant}${props.small ? " small" : ""}`} onClick={openDialog}>
        {props.icon ? <Icon name={props.icon} size={props.small ? 13 : 15} /> : null}
        {props.label}
      </button>
      {toast ? <div className="toast" role="status"><Icon name="check" size={15} />{toast}</div> : null}
      {open ? (
        <div className="backdrop" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
          <form className="dialog" onSubmit={submit}>
            <header>
              <div>
                <h3>{props.title}</h3>
                {props.description ? <p>{props.description}</p> : null}
              </div>
              <button type="button" className="icon-btn" aria-label="Close" onClick={() => setOpen(false)}><Icon name="x" /></button>
            </header>
            <div className="dialog-body">
              {props.fields.map((field, index) => (
                <label className="field" key={field.name}>
                  <span>{field.label}{field.required ? " *" : ""}</span>
                  {field.type === "select" ? (
                    <select value={values[field.name]} onChange={(event) => setValues({ ...values, [field.name]: event.target.value })}>
                      {field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  ) : field.type === "textarea" ? (
                    <textarea rows={props.csv ? 7 : 4} placeholder={field.placeholder} required={field.required} value={values[field.name]} onChange={(event) => setValues({ ...values, [field.name]: event.target.value })} autoFocus={index === 0} />
                  ) : (
                    <input type={field.type === "number" ? "number" : "text"} step={field.type === "number" ? "any" : undefined} placeholder={field.placeholder} required={field.required} value={values[field.name]} onChange={(event) => setValues({ ...values, [field.name]: event.target.value })} autoFocus={index === 0} />
                  )}
                  {field.hint ? <small>{field.hint}</small> : null}
                </label>
              ))}
              {error ? <p className="form-error">{error}</p> : null}
            </div>
            <footer>
              <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : props.submit ?? "Save"}</button>
            </footer>
          </form>
        </div>
      ) : null}
    </>
  );
}
