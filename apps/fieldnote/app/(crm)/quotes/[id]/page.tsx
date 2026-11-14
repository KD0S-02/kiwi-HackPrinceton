import { notFound } from "next/navigation";
import { ActionButton } from "../../../../components/ActionButton";
import { Pill, RecordLink } from "../../../../components/RecordLink";
import { StatusPath } from "../../../../components/StatusPath";
import { loadNames, money, prettyDate, round2 } from "../../../../lib/data";
import { signedInUser } from "../../../../lib/session";
import { preflight } from "../../../../lib/workflow/actions";
import { latestVersion } from "../../../../lib/workflow/actions/quotes";
import { find, num, openDb } from "../../../../lib/workflow/db";
import { deliveryDates, linesTotal } from "../../../../lib/workflow/money";

export const dynamic = "force-dynamic";

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = openDb();
  const quote = await find(db, "quotes.json", id);
  if (!quote) notFound();
  const person = await signedInUser();
  const [nameOf, quoteLines, contacts, rules, quotes] = await Promise.all([loadNames(), db.rows("quote-lines.json"), db.rows("contacts.json"), db.rules(), db.rows("quotes.json")]);
  const account = await find(db, "accounts.json", quote.accountId);
  const lines = quoteLines.filter((row) => row.quoteId === id);
  const buyers = contacts.filter((row) => row.accountId === quote.accountId);
  const dates = deliveryDates(account, rules);
  const latest = await latestVersion(db, quote.opportunityId);
  const siblings = quotes.filter((row) => row.opportunityId === quote.opportunityId && row.id !== id).sort((a, b) => num(b.version || 1) - num(a.version || 1));
  const [acceptBlocked, declineBlocked, convertBlocked] = await Promise.all([
    preflight("accept-quote", person, { quoteId: id, contactId: String(buyers[0]?.id ?? "x"), buyerPo: "PO" }),
    preflight("decline-quote", person, { quoteId: id, reason: "" }),
    preflight("convert-quote", person, { quoteId: id, deliveryDate: dates[0] ?? "" }),
  ]);
  const version = num(quote.version) || 1;
  const steps = ["sent", "accepted", "converted"];

  return (
    <section>
      <div className="page-head">
        <div>
          <div className="crumb"><a href="/pipeline">Pipeline</a> / <a href={`/opportunities/${quote.opportunityId}?tab=quotes`}>{nameOf(quote.accountId)}</a> / quote</div>
          <h1>{nameOf(quote.accountId)} · version {version}</h1>
          <p>{version < latest ? `Replaced by version ${latest}. ` : ""}Sent {prettyDate(quote.sentAt)} to {nameOf(quote.sentTo)} · valid until {prettyDate(quote.validUntil)}</p>
        </div>
        <div className="actions">
          <a className="btn ghost" href={`/opportunities/${quote.opportunityId}`}>Open opportunity</a>
          <ActionButton
            kiwi="decline-quote"
            icon="x"
            label="Declined"
            title="Mark the quote declined"
            action="decline-quote"
            hidden={{ quoteId: id }}
            submit="Mark declined"
            blocked={declineBlocked}
            why="title"
            fields={[{ name: "reason", label: "Why", placeholder: "Went with another distributor." }]}
          />
          <ActionButton
            kiwi="accept-quote"
            icon="check"
            label="Mark accepted"
            title="Mark the quote accepted"
            description="Record who accepted and their PO number."
            action="accept-quote"
            hidden={{ quoteId: id }}
            submit="Mark accepted"
            blocked={acceptBlocked}
            fields={[
              { name: "contactId", label: "Accepted by", type: "select", options: buyers.map((row) => ({ value: String(row.id), label: `${String(row.name)} · ${String(row.role)}` })) },
              { name: "buyerPo", label: "Buyer PO number", required: true, placeholder: "NFG-2291" },
            ]}
          />
          <ActionButton
            kiwi="convert-order"
            variant="primary"
            icon="truck"
            label="Convert to order"
            title="Convert to order"
            description="Needs the latest version accepted, no credit hold, room in available credit, and a delivery day."
            action="convert-quote"
            hidden={{ quoteId: id }}
            redirect="/orders/{id}"
            submit="Create order"
            blocked={convertBlocked}
            fields={[{ name: "deliveryDate", label: "Delivery date", type: "select", options: dates.map((day) => ({ value: day, label: prettyDate(day) })) }]}
          />
        </div>
      </div>

      <StatusPath steps={steps} current={String(quote.status)} />

      <div className="highlights">
        <div className="highlight"><span>Amount</span><strong>{money(quote.amount)}</strong><small className="sub">{num(quote.discountPercent) ? `${num(quote.discountPercent)}% off ${money(linesTotal(lines))}` : "no discount"}</small></div>
        <div className="highlight"><span>Status</span><strong><Pill value={quote.status} /></strong></div>
        <div className="highlight"><span>Accepted by</span><strong>{quote.acceptedBy ? nameOf(quote.acceptedBy) : "—"}</strong>{quote.buyerPo ? <small className="sub">PO {String(quote.buyerPo)}</small> : null}</div>
        <div className="highlight"><span>Order</span><strong>{quote.orderId ? <RecordLink id={quote.orderId} /> : "—"}</strong></div>
      </div>

      <div className="split">
        <section className="panel">
          <div className="panel-head"><h2>Lines in this version</h2><span>A snapshot. Editing the opportunity does not change it.</span></div>
          <table>
            <thead><tr><th>Product</th><th className="num">Quantity</th><th className="num">Unit price</th><th className="num">Total</th></tr></thead>
            <tbody>
              {lines.length === 0 ? <tr><td colSpan={4} className="empty">This quote was sent before lines were kept on quotes.</td></tr> : lines.map((line) => (
                <tr key={String(line.id)}>
                  <td>{nameOf(line.productId)}</td>
                  <td className="num">{num(line.quantity)}</td>
                  <td className="num">{money(line.unitPrice)}</td>
                  <td className="num">{money(round2(num(line.quantity) * num(line.unitPrice)))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="panel">
          <h2 style={{ marginBottom: 12 }}>Other versions</h2>
          {siblings.length === 0 ? <p className="empty">This is the only version.</p> : (
            <div className="stack">
              {siblings.map((row) => (
                <a className="line" key={String(row.id)} href={`/quotes/${row.id}`}>
                  <strong>Version {String(row.version || 1)}</strong>
                  <span>{money(row.amount)}</span>
                  <Pill value={row.status} />
                </a>
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
