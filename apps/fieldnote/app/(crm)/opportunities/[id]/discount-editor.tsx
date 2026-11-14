"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// Discount and Send Quote. The server decides whether sending is allowed (owner, cap or approved
// exception, lines, stock) and passes that sentence in as `blocked`; #quote-message shows it.
export function DiscountEditor({
  opportunityId,
  discountPercent,
  blocked,
  cap,
  approvedPercent,
  canEdit,
}: {
  opportunityId: string;
  discountPercent: number;
  blocked: string;
  cap: number;
  approvedPercent: number | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [discountField, setDiscountField] = useState(String(discountPercent));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => setDiscountField(String(discountPercent)), [discountPercent]);
  useEffect(() => setNote(""), [blocked]);

  async function saveDiscount() {
    setBusy(true);
    const response = await fetch(`/api/opportunities/${opportunityId}/discount`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discountPercent: Number(discountField) }),
    });
    setBusy(false);
    setNote(await response.text());
    router.refresh();
  }

  async function sendQuote() {
    setBusy(true);
    const response = await fetch(`/api/opportunities/${opportunityId}/send`, { method: "POST" });
    setBusy(false);
    setNote(await response.text());
    router.refresh();
  }

  const message = note && /quote sent/i.test(note) ? note : blocked || note || "Ready to send.";
  const ok = !blocked && /ready to send|quote sent|saved/i.test(message);
  return (
    <div className="highlight quote-box">
      <span>Discount{approvedPercent != null ? ` · approved up to ${approvedPercent}%` : ` · cap ${cap}%`}</span>
      <div className="quote-row">
        <div className="pct">
          <input id="discount" aria-label="Discount percent" value={discountField} onChange={(event) => setDiscountField(event.target.value)} inputMode="decimal" disabled={!canEdit} />
        </div>
        <button type="button" className="btn ghost" id="save-discount" onClick={saveDiscount} disabled={busy || !canEdit}>Save</button>
        <button type="button" className="btn primary" id="send-quote" data-kiwi="send-quote" disabled={busy || !!blocked} title={blocked || undefined} onClick={sendQuote}>Send Quote</button>
      </div>
      <p className={`warning${ok ? " ok" : ""}`} id="quote-message" data-kiwi="send-quote-why">{message}</p>
    </div>
  );
}
