"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DiscountEditor({
  opportunityId,
  discountPercent,
  sendAllowed,
  ownerOk,
  cap,
  approverName,
}: {
  opportunityId: string;
  discountPercent: number;
  sendAllowed: boolean;
  ownerOk: boolean;
  cap: number;
  approverName: string;
}) {
  const router = useRouter();
  const [discountField, setDiscountField] = useState(String(discountPercent));
  const [savedPercent, setSavedPercent] = useState(discountPercent);
  const [message, setMessage] = useState(
    !ownerOk
      ? "You can send a quote on your own opportunities."
      : sendAllowed
        ? "Ready to send."
        : approverName
          ? `An account executive stops at ${cap} percent. ${approverName} has to approve the rest.`
          : `An account executive stops at ${cap} percent. You approve the rest.`,
  );

  async function saveDiscount() {
    const response = await fetch(`/api/opportunities/${opportunityId}/discount`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discountPercent: Number(discountField) }),
    });
    const next = Number(discountField);
    setSavedPercent(next);
    setMessage(
      !response.ok
        ? await response.text()
        : next > cap
          ? `Saved ${next}. Still over the ${cap}% cap. ${approverName ? `${approverName} has to approve it.` : "You approve it."}`
          : ownerOk
            ? `Saved ${next}. Ready to send.`
            : `Saved ${next}. Only the owner can send this quote.`,
    );
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
        <button type="button" className="btn primary" id="send-quote" disabled={savedPercent > cap || !ownerOk} onClick={sendQuote}>Send Quote</button>
      </div>
      {message ? <p className={`warning${/ready to send|quote sent/i.test(message) ? " ok" : ""}`} id="quote-message">{message}</p> : null}
    </div>
  );
}
