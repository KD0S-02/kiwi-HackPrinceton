import { ActionButton } from "../../../components/ActionButton";
import { loadNames, money, readRecords, readRules } from "../../../lib/data";

export const dynamic = "force-dynamic";

const columns = ["Qualify", "Proposal", "Commit"];

export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ stage?: string; q?: string; owner?: string }> }) {
  const { stage = "all", q = "", owner = "mine" } = await searchParams;
  const [opportunities, accounts, quotes, approvals, rules, nameOf] = await Promise.all([
    readRecords("opportunities.json"),
    readRecords("accounts.json"),
    readRecords("quotes.json"),
    readRecords("approvals.json"),
    readRules(),
    loadNames(),
  ]);
  const needle = q.trim().toLowerCase();
  const scoped = opportunities.filter((row) => (owner === "all" ? true : row.ownerId === "user"));
  const visible = scoped.filter((row) => !needle || String(row.name).toLowerCase().includes(needle));
  const myAccounts = accounts.filter((row) => row.ownerId === "user");
  const total = visible.reduce((sum, row) => sum + Number(row.amount), 0);
  const average = visible.length ? visible.reduce((sum, row) => sum + Number(row.discountPercent), 0) / visible.length : 0;
  const over = visible.filter((row) => Number(row.discountPercent) > rules.discountCapPercent);
  const myQuotes = quotes.filter((row) => row.ownerId === "user");
  const pending = approvals.filter((row) => row.status === "pending");
  const shown = columns.filter((column) => stage === "all" || stage === column);

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Pipeline</h1>
          <p>Deals over {rules.discountCapPercent} percent stay with your manager, Alex Morgan, until he approves them.</p>
        </div>
        <div className="actions">
          <ActionButton
            variant="primary"
            icon="plus"
            label="New opportunity"
            title="New opportunity"
            endpoint="/api/records/opportunities"
            redirect="/opportunities/{id}"
            submit="Create opportunity"
            fields={[
              { name: "accountId", label: "Restaurant", type: "select", required: true, options: myAccounts.map((row) => ({ value: String(row.id), label: String(row.name) })) },
              { name: "amount", label: "Amount", type: "number", placeholder: "5000" },
              { name: "stage", label: "Stage", type: "select", options: columns.map((value) => ({ value, label: value })) },
            ]}
          />
        </div>
      </div>

      <div className="stats">
        <article className="card stat"><span>Deals in view</span><strong>{visible.length}</strong><em>{owner === "all" ? "whole company" : "your book"}</em></article>
        <article className="card stat tone-indigo"><span>Pipeline value</span><strong>{money(total)}</strong><em>open amount</em></article>
        <article className="card stat tone-green"><span>Average discount</span><strong>{average.toFixed(1)}%</strong><em>cap is {rules.discountCapPercent}%</em></article>
        <article className="card stat tone-amber"><span>Over the cap</span><strong>{over.length}</strong><em>{pending.length} approvals waiting</em></article>
      </div>

      <form className="toolbar" action="/pipeline">
        <input name="q" defaultValue={q} placeholder="Search deals" />
        <select name="stage" defaultValue={stage}>
          <option value="all">All stages</option>
          {columns.map((column) => <option key={column} value={column}>{column}</option>)}
        </select>
        <select name="owner" defaultValue={owner}>
          <option value="mine">My deals</option>
          <option value="all">Everyone</option>
        </select>
        <button className="btn ghost" type="submit">Apply filters</button>
        <a className="btn ghost" href="/pipeline">Clear</a>
      </form>

      <div className="kanban" style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` }}>
        {shown.map((column) => {
          const cards = visible.filter((row) => row.stage === column);
          const laneTotal = cards.reduce((sum, row) => sum + Number(row.amount), 0);
          return (
            <section key={column} className="lane">
              <header>
                <strong>{column}</strong>
                <span>{cards.length} · {money(laneTotal)}</span>
              </header>
              <div className="lane-body">
                {cards.length === 0 ? <p className="empty pad">No deals.</p> : cards.map((row) => (
                  <a className="deal" key={String(row.id)} href={`/opportunities/${row.id}`}>
                    <header><strong>{row.name}</strong><span>{money(row.amount)}</span></header>
                    <footer>
                      <span>{nameOf(row.ownerId)}</span>
                      <span className={Number(row.discountPercent) > rules.discountCapPercent ? "pill bad" : "pill good"}>{row.discountPercent}%</span>
                    </footer>
                  </a>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <div className="split">
        <section className="panel">
          <div className="panel-head"><h2>Quotes sent</h2><span>{myQuotes.length}</span></div>
          <div className="scroll short">
            <table>
              <thead><tr><th>Restaurant</th><th>Status</th><th className="num">Amount</th></tr></thead>
              <tbody>
                {myQuotes.map((row) => (
                  <tr key={String(row.id)}>
                    <td><a href={`/opportunities/${row.opportunityId}`}>{nameOf(row.accountId)}</a></td>
                    <td><span className="pill good">{String(row.status)}</span></td>
                    <td className="num">{money(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Waiting on your manager</h2><span>{pending.length}</span></div>
          <div className="scroll short">
            <table>
              <thead><tr><th>Deal</th><th>Kind</th><th>Status</th></tr></thead>
              <tbody>
                {pending.length === 0 ? <tr><td colSpan={3} className="empty">Nothing is waiting.</td></tr> : pending.map((row) => (
                  <tr key={String(row.id)}>
                    <td><a href={`/opportunities/${row.opportunityId}`}>{nameOf(row.opportunityId)}</a></td>
                    <td>{String(row.kind)}</td>
                    <td><span className="pill warn">{String(row.status)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </section>
  );
}
