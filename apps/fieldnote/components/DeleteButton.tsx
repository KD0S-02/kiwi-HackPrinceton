"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";

export function DeleteButton({ endpoint, name, redirect, small, id }: { endpoint: string; name: string; redirect?: string; small?: boolean; id?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(endpoint, { method: "DELETE" });
      const json = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(json.error ?? "That did not delete.");
      setOpen(false);
      if (redirect) router.push(redirect);
      else router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" id={id} className={`btn ghost danger${small ? " small" : ""}`} aria-label={`Delete ${name}`} onClick={() => setOpen(true)}>
        <Icon name="trash" size={small ? 13 : 15} />
        {small ? null : "Delete"}
      </button>
      {open ? (
        <div className="backdrop" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
          <div className="dialog" role="alertdialog">
            <header>
              <div>
                <h3>Delete {name}?</h3>
                <p>This removes it for everyone. It cannot be undone.</p>
              </div>
              <button type="button" className="icon-btn" aria-label="Close" onClick={() => setOpen(false)}><Icon name="x" /></button>
            </header>
            {error ? <div className="dialog-body"><p className="form-error">{error}</p></div> : null}
            <footer>
              <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button type="button" className="btn primary danger-fill" id="confirm-delete" disabled={busy} onClick={remove}>{busy ? "Deleting…" : "Delete"}</button>
            </footer>
          </div>
        </div>
      ) : null}
    </>
  );
}
