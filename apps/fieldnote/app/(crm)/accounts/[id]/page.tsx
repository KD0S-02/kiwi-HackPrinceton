import { notFound } from "next/navigation";
import { ActionButton } from "../../../../components/ActionButton";
import { DeleteButton } from "../../../../components/DeleteButton";
import { FollowButton } from "../../../../components/FollowButton";
import { Pill } from "../../../../components/RecordLink";
import { Timeline } from "../../../../components/Timeline";
import { loadNames, money, prettyDate } from "../../../../lib/data";
import { signedInUser } from "../../../../lib/session";
import { accountActivity } from "../../../../lib/workflow/activity";
import { preflight } from "../../../../lib/workflow/actions";
import { callOutcomes } from "../../../../lib/workflow/actions/cases";
import { orderBlocker, releaseBlocker } from "../../../../lib/workflow/credit";
import { find, num, openDb } from "../../../../lib/workflow/db";
import { agingBuckets, availableCredit, committed, invoiceBalance, isPastDue, openBalance } from "../../../../lib/workflow/money";
import { accountReason, financeCheck } from "../../../../lib/workflow/permissions";

export const dynamic = "force-dynamic";

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = openDb();
  const account = await find(db, "accounts.json", id);
  if (!account) notFound();
  const person = await signedInUser();
  const [contacts, opportunities, orders, cases, activity, invoices, territories, warehouses, rules, nameOf] = await Promise.all([
    db.rows("contacts.json"),
    db.rows("opportunities.json"),
    db.rows("orders.json"),
    db.rows("cases.json"),
    db.rows("activity.json"),
    db.rows("invoices.json"),
    db.rows("territories.json"),
    db.rows("warehouses.json"),
    db.rules(),
    loadNames(),
  ]);
  const people = contacts.filter((row) => row.accountId === id);
  const deals = opportunities.filter((row) => row.accountId === id);
  const accountOrders = orders.filter((row) => row.accountId === id).sort((a, b) => String(b.id).localeCompare(String(a.id), undefined, { numeric: true }));
  const accountCases = cases.filter((row) => row.accountId === id);
  const accountInvoices = invoices.filter((row) => row.accountId === id);
  const notes = accountActivity(activity, id, deals.map((deal) => String(deal.id)));
  const onboarding = account.status === "onboarding";
  const onHold = account.creditHold === "yes";
  const editBlocked = await accountReason(db, person, account);
  const balance = await openBalance(db, id);
  const promised = await committed(db, id);
  const available = await availableCredit(db, account);
  const aging = agingBuckets(accountInvoices);
  const newOrderBlocked = editBlocked || (await orderBlocker(db, account, 1));
  const holdBlocker = onHold ? await releaseBlocker(db, account) : "";
  const [requestBlocked, releaseBlocked] = await Promise.all([
    onHold ? preflight("request-release", person, { accountId: id }) : Promise.resolve(""),
    onHold ? preflight("release-hold", person, { accountId: id }) : Promise.resolve(""),
  ]);
  const placeBlocked = financeCheck(person) || (onHold ? `${account.name} is already on credit hold.` : "");
  const pastDue = accountInvoices.filter((row) => isPastDue(row, rules));
  const lifetime = accountOrders.reduce((sum, row) => sum + num(row.amount), 0);

  return (
    <section>
      <div className="page-head">
        <div>
          <div className="crumb"><a href="/accounts">Accounts</a> / {String(account.name)}</div>
          <div className="record-title">
            <span className="avatar">{String(account.name).slice(0, 1)}</span>
            <div>
              <h1>{String(account.name)} {onboarding ? <span className="pill warn">onboarding</span> : null}{onHold ? <span className="pill bad">credit hold</span> : null}</h1>
              <p>{nameOf(account.territoryId)} · {nameOf(account.warehouseId)} · owned by {nameOf(account.ownerId)}{account.zip ? ` · ZIP ${account.zip}` : ""}</p>
            </div>
          </div>
        </div>
        <div className="actions">
          <FollowButton id={id} />
          <ActionButton
            icon="edit"
            label="Edit"
            title={`Edit ${String(account.name)}`}
            endpoint={`/api/records/accounts/${id}`}
            method="PATCH"
            blocked={editBlocked}
            why="title"
            fields={[
              { name: "name", label: "Restaurant name", value: String(account.name), required: true },
              { name: "buyerName", label: "Buyer", value: String(account.buyerName ?? "") },
              { name: "usualOrder", label: "Usual order", value: String(account.usualOrder ?? "") },
              { name: "territoryId", label: "Territory", type: "select", value: String(account.territoryId ?? ""), options: territories.map((row) => ({ value: String(row.id), label: String(row.name) })) },
              { name: "warehouseId", label: "Warehouse", type: "select", value: String(account.warehouseId ?? ""), options: warehouses.map((row) => ({ value: String(row.id), label: String(row.name) })), hint: "Has to be in the territory's office." },
            ]}
          />
          {editBlocked ? null : <DeleteButton endpoint={`/api/records/accounts/${id}`} name={String(account.name)} redirect="/accounts" />}
          <ActionButton
            kiwi="log-call"
            icon="phone"
            label="Log call"
            title={`Log a call with ${String(account.name)}`}
            action="log-call"
            hidden={{ subjectType: "account", subjectId: id }}
            blocked={editBlocked}
            why="title"
            fields={[
              { name: "outcome", label: "How it went", type: "select", options: callOutcomes.map((value) => ({ value, label: value })) },
              { name: "text", label: "Note", type: "textarea", required: true, placeholder: "Called Priya about the standing order." },
            ]}
          />
          <ActionButton
            kiwi="new-order"
            variant="primary"
            icon="plus"
            label="New order"
            title={`New order for ${String(account.name)}`}
            description={`Available credit ${money(available)}.`}
            endpoint="/api/records/orders"
            redirect="/orders/{id}"
            submit="Create order"
            hidden={{ accountId: id, warehouseId: String(account.warehouseId ?? "") }}
            blocked={newOrderBlocked}
            why="title"
            fields={[{ name: "amount", label: "Amount", type: "number", required: true, placeholder: "1500" }]}
          />
        </div>
      </div>

      {onHold ? (
        <div className="banner bad" data-kiwi="hold-banner">
          <div>
            <strong>On credit hold since {prettyDate(account.holdSince)}.</strong> {String(account.holdReason)} New orders are refused until finance releases the hold.
            {holdBlocker ? <p className="warning">{holdBlocker}</p> : <p className="ok-text">Release conditions are met.</p>}
          </div>
          <div className="actions">
            <ActionButton kiwi="request-release" icon="send" label="Request release" title="Ask finance to release the hold" action="request-release" hidden={{ accountId: id }} submit="Send request" blocked={requestBlocked} why="title" fields={[{ name: "note", label: "Note", type: "textarea", placeholder: "First installment is in." }]} />
            <ActionButton kiwi="release-hold" variant="primary" icon="lock" label="Release hold" title="Release the credit hold" action="release-hold" hidden={{ accountId: id }} submit="Release hold" blocked={releaseBlocked} why="title" fields={[]} />
          </div>
        </div>
      ) : null}

      {onboarding ? (
        <div className="banner warn" data-kiwi-fact="setup">
          <strong>{account.territoryId ? `${account.name} is not active yet.` : `No territory covers ZIP ${account.zip || "(none)"}. Ask your manager.`}</strong>
        </div>
      ) : null}

      <div className="metric-row">
        <div className="metric-pair">
          <div className="highlight"><span>Credit limit</span><strong>{money(account.creditLimit)}</strong><small className="sub">{String(account.paymentTerms || "no terms")} · {String(account.creditStatus || "none")}</small></div>
          <div className="highlight"><span>Open balance</span><strong>{money(balance)}</strong><small className="sub">{pastDue.length ? `${pastDue.length} past due` : "nothing past due"}</small></div>
        </div>
        <div className="metric-pair">
          <div className="highlight"><span>Committed</span><strong>{money(promised)}</strong><small className="sub">orders not billed yet</small></div>
          <div className={`highlight${available < 0 ? " alert" : ""}`}><span>Available credit</span><strong id="available-credit">{money(available)}</strong></div>
        </div>
      </div>

      <div className="split even">
        <section className="panel" data-kiwi="credit-panel">
          <div className="panel-head">
            <h2>Credit</h2>
            <ActionButton small kiwi="place-hold" icon="lock" label="Place hold" title={`Put ${String(account.name)} on credit hold`} description="Open orders that have not shipped become held." action="place-hold" hidden={{ accountId: id }} submit="Place hold" blocked={placeBlocked} why="title" fields={[{ name: "reason", label: "Reason", required: true, value: pastDue[0] ? `${pastDue[0].id} is past due.` : "" }]} />
          </div>
          <div className="aging">
            {aging.map((bucket) => (
              <div key={bucket.label} className={bucket.amount > 0 && bucket.label !== "Current" ? "late" : ""}>
                <span>{bucket.label}</span>
                <strong>{money(bucket.amount)}</strong>
              </div>
            ))}
          </div>
          <table style={{ marginTop: 14 }}>
            <thead><tr><th>Invoice</th><th>Due</th><th>Status</th><th className="num">Balance</th></tr></thead>
            <tbody>
              {accountInvoices.length === 0 ? <tr><td colSpan={4} className="empty">No invoices yet.</td></tr> : accountInvoices.map((row) => (
                <tr key={String(row.id)}>
                  <td><a href={`/invoices/${row.id}`}>{String(row.id)}</a></td>
                  <td>{prettyDate(row.dueDate)}</td>
                  <td>{isPastDue(row, rules) ? <span className="pill bad">past due</span> : <Pill value={row.status} />}</td>
                  <td className="num">{money(invoiceBalance(row))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2>Contacts</h2>
            <ActionButton small kiwi={onboarding ? "add-contact" : "add-buyer"} icon="plus" label="Add contact" title="Add contact" endpoint="/api/records/contacts" hidden={{ accountId: id }} blocked={editBlocked} why="title" fields={[{ name: "name", label: "Name", required: true }, { name: "role", label: "Role", type: "select", options: ["buyer", "accounts payable", "chef", "owner"].map((value) => ({ value, label: value })) }, { name: "email", label: "Email", type: "email" }, { name: "phone", label: "Phone" }]} />
          </div>
          {people.length === 0 ? <p className="empty">No contacts on file.</p> : people.map((row) => (
            <div className="person" key={String(row.id)}>
              <span className="avatar">{String(row.name).slice(0, 1)}</span>
              <div><strong>{String(row.name)}</strong><small>{String(row.role)}{row.email ? ` · ${row.email}` : ""}</small></div>
            </div>
          ))}
          <dl className="facts" style={{ marginTop: 14 }}>
            <dt>Price book</dt><dd>{nameOf(account.priceBookId)}</dd>
            <dt>Delivery days</dt><dd>{String(account.deliveryDays || "—").split("|").join(", ")}</dd>
            <dt>Tax</dt><dd>{String(account.taxStatus || "—")}{account.taxCertificate ? ` · ${account.taxCertificate}` : ""}</dd>
            <dt>Usual order</dt><dd>{String(account.usualOrder ?? "—")}</dd>
          </dl>
        </section>
      </div>

      <div className="split even">
        <section className="panel">
          <div className="panel-head"><h2>Deals</h2><a href="/pipeline">Pipeline →</a></div>
          {deals.length === 0 ? <p className="empty">No deals yet.</p> : (
            <table>
              <thead><tr><th>Deal</th><th>Stage</th><th className="num">Amount</th><th>Discount</th></tr></thead>
              <tbody>
                {deals.map((row) => (
                  <tr key={String(row.id)}>
                    <td><a href={`/opportunities/${row.id}`}>{String(row.name)}</a></td>
                    <td><span className="pill">{String(row.stage)}</span></td>
                    <td className="num">{money(row.amount)}</td>
                    <td><span className={num(row.discountPercent) > rules.discountCapPercent ? "pill bad" : "pill good"}>{num(row.discountPercent)}%</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <h2 style={{ margin: "20px 0 12px" }}>Orders and cases</h2>
          {accountOrders.length + accountCases.length === 0 ? <p className="empty">No orders or cases yet. {money(lifetime)} to date.</p> : (
            <div className="stack">
              {accountOrders.map((row) => (
                <a className="line" key={String(row.id)} href={`/orders/${row.id}`}>
                  <strong>{String(row.id)}</strong>
                  <span>{money(row.amount)} · {prettyDate(row.deliveryDate)}</span>
                  <Pill value={row.status} />
                </a>
              ))}
              {accountCases.map((row) => (
                <a className="line" key={String(row.id)} href={`/cases/${row.id}`}>
                  <strong>{String(row.subject || row.kind)}</strong>
                  <span>Case {String(row.id)}</span>
                  <Pill value={row.status} />
                </a>
              ))}
            </div>
          )}
        </section>
        <section className="panel">
          <h2 style={{ marginBottom: 14 }}>Activity</h2>
          <Timeline entries={notes} nameOf={nameOf} />
        </section>
      </div>
    </section>
  );
}
