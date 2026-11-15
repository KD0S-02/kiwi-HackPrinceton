import { ActionButton } from "../../components/ActionButton";
import { loadNames, money, readRecords, readRules } from "../../lib/data";
import { seesAll } from "../../lib/people";
import { approvalAmount, approvalKind, approvalNumber } from "../../lib/workflow/view";
import { signedInUser } from "../../lib/session";

export const dynamic = "force-dynamic";

const stages = [
  { stage: "Qualify", color: "#9db1ff" },
  { stage: "Proposal", color: "#2f5bea" },
  { stage: "Commit", color: "#12b76a" },
  { stage: "Closed Won", color: "#d0d5dd" },
];

export default async function HomePage() {
  const [opportunities, accounts, cases, approvals, rules, nameOf] = await Promise.all([
    readRecords("opportunities.json"),
    readRecords("accounts.json"),
    readRecords("cases.json"),
    readRecords("approvals.json"),
    readRules(),
    loadNames(),
  ]);
  const person = await signedInUser();
  const wide = seesAll(person);
  const mine = wide ? opportunities : opportunities.filter((row) => row.ownerId === person.id);
  const myAccounts = wide ? accounts : accounts.filter((row) => row.ownerId === person.id);
  const myCases = cases.filter((row) => row.status !== "closed" && (wide || row.ownerId === person.id));
  const waiting = approvals.filter((row) => row.status === "pending" && row.approverId === person.id && row.requestedBy !== person.id);
  const asked = approvals.filter((row) => row.status === "pending" && row.requestedBy === person.id);
  const onHold = myAccounts.filter((row) => row.creditHold === "yes");
  const pipeline = mine.reduce((sum, row) => sum + Number(row.amount), 0);
  const overCap = mine.filter((row) => Number(row.discountPercent) > rules.discountCapPercent);
  const harbor = opportunities.find((row) => row.id === "opp-harbor-diner");
  const focusApproval = waiting[0] ?? null;
  const focus = (focusApproval && opportunities.find((row) => row.id === focusApproval.opportunityId)) || overCap[0] || harbor;
  const focusPending = focus
    ? waiting.find((row) => row.opportunityId === focus.id) || asked.find((row) => row.opportunityId === focus.id)
    : null;
  const canDecideFocus = Boolean(focusPending && focusPending.approverId === person.id && focusPending.requestedBy !== person.id);
  const canRequestFocus = Boolean(
    focus
    && Number(focus.discountPercent) > rules.discountCapPercent
    && !focusPending
    && (focus.ownerId === person.id || wide)
    && person.approverName
  );
  const stageRows = stages.map((stage) => {
    const rows = mine.filter((row) => row.stage === stage.stage);
    return { ...stage, count: rows.length, amount: rows.reduce((sum, row) => sum + Number(row.amount), 0) };
  });

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Good morning, {person.name.split(" ")[0]}</h1>
          <p>{person.greeting}</p>
        </div>
        <div className="actions">
          <a className="btn ghost" href={wide ? "/accounts?owner=all" : "/accounts"}>{person.book === "company" ? "The company" : wide ? "Team book" : "Your book"}</a>
          <ActionButton
            variant="primary"
            icon="plus"
            label="New opportunity"
            title="New opportunity"
            kiwi="new-opportunity"
            description={wide ? "Start a deal on a restaurant. It stays with that restaurant's owner." : "Start a deal for one of your restaurants."}
            endpoint="/api/records/opportunities"
            redirect="/opportunities/{id}"
            submit="Create opportunity"
            fields={[
              { name: "accountId", label: "Restaurant", type: "select", required: true, options: myAccounts.map((row) => ({ value: String(row.id), label: String(row.name) })) },
              { name: "amount", label: "Amount", type: "number", placeholder: "5000" },
              { name: "stage", label: "Stage", type: "select", options: ["Qualify", "Proposal", "Commit"].map((value) => ({ value, label: value })) },
            ]}
          />
        </div>
      </div>

      <div className="home-board">
        <section className="today">
          <ul className="stat-list">
            <li data-kiwi="today-restaurants" data-kiwi-fact="today-restaurants"><span>{wide ? "Restaurants" : "Your restaurants"}</span><strong>{myAccounts.length}</strong><em>of {accounts.length} in the company</em></li>
            <li data-kiwi="today-deals" data-kiwi-fact="today-deals"><span>Open deals</span><strong>{mine.length}</strong><em>{money(pipeline)} pipeline</em></li>
            <li className="tone-amber" data-kiwi="today-over-cap" data-kiwi-fact="today-over-cap"><span>Over the cap</span><strong>{overCap.length}</strong><em>{person.approverName ? `need ${person.approverName}` : "yours to approve"}</em></li>
            <li className="tone-red" data-kiwi="today-cases" data-kiwi-fact="today-cases"><span>Open cases</span><strong>{myCases.length}</strong><em>{person.book === "company" ? "across the company" : wide ? "across the team" : "on your restaurants"}</em></li>
          </ul>
        </section>
        {waiting.length > 0 || asked.length > 0 || onHold.length > 0 ? (
          <section className="panel">
            <div className="panel-head">
              <h2 data-kiwi="waiting-on-you">{waiting.length > 0 ? `Waiting on you · ${waiting.length}` : "Waiting on others"}</h2>
              <a href={waiting.length > 0 ? "/approvals?view=waiting" : "/approvals?view=requests"}>Approvals →</a>
            </div>
            <div className="scroll short">
              <ul className="wait-check">
                {waiting.slice(0, 6).map((row) => (
                  <li key={String(row.id)} className="with-actions">
                    <div className="wait-row" data-kiwi={`wait-${row.id}`} data-kiwi-fact={`wait-${row.id}`}>
                      <strong>{nameOf(row.accountId || row.opportunityId)} <span className="muted">{approvalNumber(row.id)}</span></strong>
                      <small>{approvalKind(row.kind)} · {approvalAmount(row)} · from {nameOf(row.requestedBy)}</small>
                    </div>
                    <div className="row-actions">
                      <ActionButton
                        small
                        kiwi={`approve-${row.id}`}
                        variant="primary"
                        icon="check"
                        label="Approve"
                        title={`Approve ${approvalNumber(row.id)}`}
                        action="decide-approval"
                        hidden={{ approvalId: String(row.id), decision: "approved" }}
                        submit="Approve"
                        fields={[
                          ...(row.kind === "credit limit" ? [{ name: "amount", label: "Approved limit", type: "number" as const, value: String(row.amount ?? "") }] : []),
                          { name: "note", label: "Note (optional)", type: "textarea" as const },
                        ]}
                      />
                      <ActionButton
                        small
                        kiwi={`reject-${row.id}`}
                        variant="soft-danger"
                        icon="x"
                        label="Reject"
                        title={`Reject ${approvalNumber(row.id)}`}
                        action="decide-approval"
                        hidden={{ approvalId: String(row.id), decision: "rejected" }}
                        submit="Reject"
                        fields={[{ name: "note", label: "Why", type: "textarea", required: true }]}
                      />
                    </div>
                  </li>
                ))}
                {waiting.length === 0 ? asked.slice(0, 6).map((row) => (
                  <li key={String(row.id)}>
                    <a href={row.opportunityId ? `/opportunities/${row.opportunityId}` : `/accounts/${row.accountId}`} data-kiwi={`wait-${row.id}`} data-kiwi-fact={`wait-${row.id}`}>
                      <strong>{nameOf(row.accountId || row.opportunityId)} <span className="muted">{approvalNumber(row.id)}</span></strong>
                      <small>{approvalKind(row.kind)} · {approvalAmount(row)} · waiting on {nameOf(row.approverId)}</small>
                    </a>
                  </li>
                )) : null}
                {onHold.map((row) => (
                  <li key={`hold-${row.id}`}>
                    <a href={`/accounts/${row.id}`} data-kiwi={`wait-hold-${row.id}`} data-kiwi-fact={`wait-hold-${row.id}`}>
                      <strong>{String(row.name)}</strong>
                      <small>Credit hold · {String(row.holdReason)}</small>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}
      </div>

      <div className="dash-top">
        {focus ? (
          <section className="panel harbor-card">
            <div className="panel-label">Needs a decision</div>
            <h2>{String(focus.name)}{focusPending ? <span className="muted"> {approvalNumber(focusPending.id)}</span> : null}</h2>
            <p>{focus.stage} · {money(focus.amount)}</p>
            <div className="harbor-meta">
              <span className="pill bad">{String(focus.discountPercent)}% discount</span>
              <span className="pill warn">Send Quote is off</span>
            </div>
            <p className="warning">
              {canDecideFocus
                ? `${nameOf(focusPending!.requestedBy)} asked for ${approvalKind(focusPending!.kind)} ${approvalAmount(focusPending!)}. Decide it here.`
                : focusPending
                  ? `Waiting on ${nameOf(focusPending.approverId)} for ${approvalKind(focusPending.kind)} ${approvalNumber(focusPending.id)}.`
                  : `An account executive stops at ${rules.discountCapPercent} percent. ${person.approverName ? `${person.approverName} has to approve the rest.` : "You approve the rest."}`}
            </p>
            <div className="row-actions">
              {canDecideFocus ? (
                <>
                  <ActionButton
                    kiwi={`approve-${focusPending!.id}`}
                    variant="primary"
                    icon="check"
                    label="Approve"
                    title={`Approve ${approvalNumber(focusPending!.id)}`}
                    action="decide-approval"
                    hidden={{ approvalId: String(focusPending!.id), decision: "approved" }}
                    submit="Approve"
                    fields={[
                      ...(focusPending!.kind === "credit limit" ? [{ name: "amount", label: "Approved limit", type: "number" as const, value: String(focusPending!.amount ?? "") }] : []),
                      { name: "note", label: "Note (optional)", type: "textarea" as const },
                    ]}
                  />
                  <ActionButton
                    kiwi={`reject-${focusPending!.id}`}
                    variant="soft-danger"
                    icon="x"
                    label="Reject"
                    title={`Reject ${approvalNumber(focusPending!.id)}`}
                    action="decide-approval"
                    hidden={{ approvalId: String(focusPending!.id), decision: "rejected" }}
                    submit="Reject"
                    fields={[{ name: "note", label: "Why", type: "textarea", required: true }]}
                  />
                </>
              ) : null}
              {canRequestFocus ? (
                <ActionButton
                  variant="primary"
                  icon="check"
                  kiwi="request-approval"
                  label="Request approval"
                  title="Request approval"
                  description={`${person.approverName} gets the request for ${focus.discountPercent}%.`}
                  endpoint="/api/records/approvals"
                  hidden={{ opportunityId: String(focus.id) }}
                  fields={[
                    { name: "kind", label: "What needs approval", type: "select", options: [{ value: "discount", label: `Discount of ${focus.discountPercent}%` }, { value: "pricing exception", label: "Pricing exception" }] },
                    { name: "note", label: "Why", type: "textarea", placeholder: "Matching a competitor's price on the standing order." },
                  ]}
                />
              ) : null}
              <a className={canDecideFocus || canRequestFocus ? "btn ghost" : "btn primary"} href={`/opportunities/${focus.id}`}>Open the opportunity</a>
            </div>
          </section>
        ) : (
          <section className="panel"><div className="panel-label">Needs a decision</div><p className="empty">Every quote is within the cap.</p></section>
        )}
        <section className="panel">
          <div className="panel-label">{person.book === "company" ? "Company pipeline" : wide ? "Team pipeline" : "Your pipeline"}</div>
          <p className="big-number">{money(pipeline)}</p>
          <div className="mix" aria-hidden="true">
            {stageRows.map((stage) => (
              <i key={stage.stage} style={{ width: `${pipeline === 0 ? 0 : (stage.amount / pipeline) * 100}%`, background: stage.color }} />
            ))}
          </div>
          <ul className="legend">
            {stageRows.map((stage) => (
              <li key={stage.stage}>
                <i style={{ background: stage.color }} />
                <span>{stage.stage}</span>
                <strong>{stage.count}</strong>
                <em>{money(stage.amount)}</em>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="dash-bottom">
        <section className="panel">
          <div className="panel-head">
            <h2>{person.book === "company" ? "Company deals" : wide ? "Team deals" : "Your deals"}</h2>
            <a href={wide ? "/pipeline?owner=all" : "/pipeline"}>Open pipeline →</a>
          </div>
          <div className="scroll">
            <table>
              <thead><tr><th>Restaurant</th><th>Stage</th><th className="num">Amount</th><th>Discount</th></tr></thead>
              <tbody>
                {mine.map((row) => (
                  <tr key={String(row.id)}>
                    <td><a href={`/opportunities/${row.id}`}>{row.name}</a></td>
                    <td><span className="pill">{row.stage}</span></td>
                    <td className="num">{money(row.amount)}</td>
                    <td><span className={Number(row.discountPercent) > rules.discountCapPercent ? "pill bad" : "pill good"}>{row.discountPercent}%</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2>Open cases</h2>
            <a href="/cases">All cases →</a>
          </div>
          <div className="stack">
            {myCases.length === 0 ? <p className="empty">No open cases.</p> : myCases.map((row) => (
              <a className="case-row" key={String(row.id)} href={`/cases/${row.id}`}>
                <strong>{nameOf(row.accountId)}</strong>
                <span>{String(row.subject && row.subject !== row.kind ? row.subject : row.kind)} · {row.status}</span>
              </a>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
