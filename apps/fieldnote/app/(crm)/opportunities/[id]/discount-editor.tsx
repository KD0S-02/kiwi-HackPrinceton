"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DiscountEditor({
  opportunityId,
  discountPercent,
  sendAllowed,
  ownerOk,
  cap,
}: {
  opportunityId: string;
  discountPercent: number;
  sendAllowed: boolean;
  ownerOk: boolean;
  cap: number;
}) {
  const router = useRouter();
  const [discountField, setDiscountField] = useState(String(discountPercent));
  const [message, setMessage] = useState(
    !ownerOk
      ? "You can send a quote on your own opportunities."
      : sendAllowed
        ? "Ready to send."
        : `An account executive stops at ${cap} percent. Your manager, Alex Morgan, has to approve the rest.`,
  );

  async function saveDiscount() {
    const response = await fetch(`/api/opportunities/${opportunityId}/discount`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discountPercent: Number(discountField) }),
    });
    setMessage(await response.text());
    router.refresh();
  }

  async function sendQuote() {
    const response = await fetch(`/api/opportunities/${opportunityId}/send`, { method: "POST" });
    setMessage(await response.text());
    router.refresh();
  }

  return (
    <div className="highlight quote-box">
      <span>Discount</span>
      <div className="quote-row">
        <div className="pct">
          <input id="discount" value={discountField} onChange={(event) => setDiscountField(event.target.value)} inputMode="decimal" />
        </div>
        <button type="button" className="btn ghost" id="save-discount" onClick={saveDiscount}>Save</button>
        <button type="button" className="btn primary" id="send-quote" disabled={!sendAllowed || !ownerOk} onClick={sendQuote}>Send Quote</button>
      </div>
      {message ? <p className={`warning${message === "Ready to send." || message === "Quote sent." ? " ok" : ""}`} id="quote-message">{message}</p> : null}
    </div>
  );
}
