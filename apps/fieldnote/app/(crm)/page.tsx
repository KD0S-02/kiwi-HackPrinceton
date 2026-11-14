import { ActionButton } from "../../components/ActionButton";
import { loadNames, money, readRecords, readRules } from "../../lib/data";

export const dynamic = "force-dynamic";

const stages = [
  { stage: "Qualify", color: "#9db1ff" },
  { stage: "Proposal", color: "#2f5bea" },
  { stage: "Commit", color: "#12b76a" },
  { stage: "Closed", color: "#d0d5dd" },
];

export default async function HomePage() {
  const [opportunities, accounts, cases, rules, nameOf] = await Promise.all([
    readRecords("opportunities.json"),
    readRecords("accounts.json"),
    readRecords("cases.json"),
    readRules(),
    loadNames(),
  ]);
  const mine = opportunities.filter((row) => row.ownerId === "user");
  const myAccounts = accounts.filter((row) => row.ownerId === "user");
  const myCases = cases.filter((row) => row.ownerId === "user" && row.status === "open");
  const pipeline = mine.reduce((sum, row) => sum + Number(row.amount), 0);
  const overCap = mine.filter((row) => Number(row.discountPercent) > rules.discountCapPercent);
  const harbor = opportunities.find((row) => row.id === "opp-harbor-diner");
  const focus = overCap[0] ?? harbor;
  const stageRows = stages.map((stage) => {
    const rows = mine.filter((row) => row.stage === stage.stage);
    return { ...stage, count: rows.length, amount: rows.reduce((sum, row) => sum + Number(row.amount), 0) };
  });

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Good morning, Sparsh</h1>
          <p>Your manager, Alex Morgan, reviews anything over {rules.discountCapPercent} percent. You send quotes on your own book.</p>
        </div>
        <div className="actions">
          <a className="btn ghost" href="/accounts">Your book</a>
          <ActionButton
            variant="primary"
            icon="plus"
            label="New opportunity"
            title="New opportunity"
            description="Start a deal for one of your restaurants."
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

      <div className="stats">
        <article className="card stat"><span>Your restaurants</span><strong>{myAccounts.length}</strong><em>of {accounts.length} in the company</em></article>
        <article className="card stat tone-indigo"><span>Open deals</span><strong>{mine.length}</strong><em>{money(pipeline)} pipeline</em></article>
        <article className="card stat tone-amber"><span>Over the cap</span><strong>{overCap.length}</strong><em>need your manager</em></article>
        <article className="card stat tone-red"><span>Open cases</span><strong>{myCases.length}</strong><em>on your restaurants</em></article>
      </div>

      <div className="dash-top">
        {focus ? (
          <section className="panel harbor-card">
            <div className="panel-label">Needs a decision</div>
            <h2>{String(focus.name)}</h2>
            <p>{focus.stage} · {money(focus.amount)}</p>
            <div className="harbor-meta">
              <span className="pill bad">{String(focus.discountPercent)}% discount</span>
              <span className="pill warn">Send Quote is off</span>
            </div>
            <p className="warning">An account executive stops at {rules.discountCapPercent} percent. Your manager, Alex Morgan, has to approve the rest.</p>
            <a className="btn primary" href={`/opportunities/${focus.id}`}>Open the opportunity</a>
          </section>
        ) : (
          <section className="panel"><div className="panel-label">Needs a decision</div><p className="empty">Every quote is within the cap.</p></section>
        )}
        <section className="panel">
          <div className="panel-label">Your pipeline</div>
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
            <h2>Your deals</h2>
            <a href="/pipeline">Open pipeline →</a>
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
            <a href="/orders">Fulfillment →</a>
          </div>
          <div className="stack">
            {myCases.length === 0 ? <p className="empty">No open cases.</p> : myCases.map((row) => (
              <a className="case-row" key={String(row.id)} href={`/accounts/${row.accountId}`}>
                <strong>{nameOf(row.accountId)}</strong>
                <span>{row.kind}</span>
              </a>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
