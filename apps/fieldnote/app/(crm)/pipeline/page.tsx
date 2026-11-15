import { ActionButton } from "../../../components/ActionButton";
import { DeleteButton } from "../../../components/DeleteButton";
import { FilterBar } from "../../../components/FilterBar";
import { loadNames, money, readRecords, readRules, restaurantChoice, slug } from "../../../lib/data";
import { ownerMatches, textMatches } from "../../../lib/filters";
import { loadFilters } from "../../../lib/page-filters";
import { seesAll } from "../../../lib/people";
import { signedInUser } from "../../../lib/session";

export const dynamic = "force-dynamic";

const columns = ["Qualify", "Proposal", "Commit", "Closed Won"];
const openStages = ["Qualify", "Proposal", "Commit"];

export default async function PipelinePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  if (params.stage === "all") delete params.stage;
  const { filters, values } = await loadFilters("/pipeline", params);
  const [opportunities, accounts, quotes, approvals, rules, nameOf] = await Promise.all([
    readRecords("opportunities.json"),
    readRecords("accounts.json"),
    readRecords("quotes.json"),
    readRecords("approvals.json"),
    readRules(),
    loadNames(),
  ]);
  const person = await signedInUser();
  const cap = rules.discountCapPercent;
  const min = Number(values.min || 0);
  const visible = opportunities.filter((row) =>
    ownerMatches(row.ownerId, values.owner, person)
    && (!values.stage || row.stage === values.stage)
    && (values.discount !== "over" || Number(row.discountPercent) > cap)
    && (values.discount !== "within" || Number(row.discountPercent) <= cap)
    && Number(row.amount) >= min
    && textMatches(values.q, [row.name, nameOf(row.accountId), nameOf(row.ownerId)]));
  const owners = filters.find((filter) => filter.name === "owner")?.choices.filter((option) => option.value !== "mine") ?? [];
  const wide = seesAll(person);
  const myAccounts = wide ? accounts : accounts.filter((row) => row.ownerId === person.id);
  const total = visible.reduce((sum, row) => sum + Number(row.amount), 0);
  const average = visible.length ? visible.reduce((sum, row) => sum + Number(row.discountPercent), 0) / visible.length : 0;
  const over = visible.filter((row) => Number(row.discountPercent) > rules.discountCapPercent);
  const myQuotes = wide ? quotes : quotes.filter((row) => row.ownerId === person.id);
  const pending = approvals.filter((row) => row.status === "pending");
  const shown = columns.filter((column) => !values.stage || values.stage === column);

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Pipeline</h1>
          <p>{person.approverName ? `Deals over ${rules.discountCapPercent} percent stay with ${person.approverName} until approved.` : `Deals over ${rules.discountCapPercent} percent stop with you.`}</p>
        </div>
        <div className="actions">
          <ActionButton
            variant="primary"
            icon="plus"
            label="New opportunity"
            title="New opportunity"
            kiwi="new-opportunity"
            endpoint="/api/records/opportunities"
            redirect="/opportunities/{id}"
            submit="Create opportunity"
            fields={[
              { name: "accountId", label: "Restaurant", type: "select", required: true, options: myAccounts.map(restaurantChoice) },
              { name: "amount", label: "Amount", type: "number", placeholder: "5000" },
              { name: "stage", label: "Stage", type: "select", options: openStages.map((value) => ({ value, label: value })) },
            ]}
          />
        </div>
      </div>

      <div className="stats">
        <article className="card stat"><span>Deals in view</span><strong>{visible.length}</strong><em>{values.owner === "mine" ? (person.book === "company" ? "the whole company" : wide ? "the team's book" : "your book") : values.owner === "all" ? "whole company" : nameOf(values.owner)}</em></article>
        <article className="card stat tone-indigo"><span>Pipeline value</span><strong>{money(total)}</strong><em>open amount</em></article>
        <article className="card stat tone-green"><span>Average discount</span><strong>{average.toFixed(1)}%</strong><em>cap is {rules.discountCapPercent}%</em></article>
        <article className="card stat tone-amber"><span>Over the cap</span><strong>{over.length}</strong><em>{pending.length} approvals waiting</em></article>
      </div>

      <FilterBar path="/pipeline" filters={filters} values={values} shown={visible.length} total={opportunities.length} noun="deals" />

      <div className="kanban" data-kiwi="results" style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` }}>
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
                {cards.length === 0 ? <p className="empty pad">No deals.</p> : cards.map((row) => {
                  const restaurant = accounts.find((item) => item.id === row.accountId);
                  const ready = restaurant?.status === "active" && restaurant?.warehouseId;
                  return (
                  <a className="deal" key={String(row.id)} data-kiwi={ready ? `deal-${slug(String(row.name).replace(/['’]/g, ""))}` : `deal-unready-${row.id}`} href={`/opportunities/${row.id}`}>
                    <header><strong>{row.name}</strong><span>{money(row.amount)}</span></header>
                    <footer>
                      <span>{ready ? nameOf(row.ownerId) : "Not set up"}</span>
                      <span className={Number(row.discountPercent) > cap ? "pill bad" : "pill good"}>{row.discountPercent}%</span>
                    </footer>
                  </a>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <section className="panel">
        <div className="panel-head"><h2>Deals in view</h2><span>{visible.length}</span></div>
        <div className="scroll short">
          <table>
            <thead><tr><th>Deal</th><th>Owner</th><th>Stage</th><th className="num">Amount</th><th>Discount</th><th></th></tr></thead>
            <tbody>
              {visible.length === 0 ? <tr><td colSpan={6} className="empty">No deals match those filters.</td></tr> : visible.map((row) => (
                <tr key={String(row.id)}>
                  <td><a href={`/opportunities/${row.id}`}>{row.name}</a></td>
                  <td>{nameOf(row.ownerId)}</td>
                  <td><span className="pill">{row.stage}</span></td>
                  <td className="num">{money(row.amount)}</td>
                  <td><span className={Number(row.discountPercent) > cap ? "pill bad" : "pill good"}>{row.discountPercent}%</span></td>
                  <td>
                    <div className="row-actions">
                      <ActionButton
                        small
                        icon="edit"
                        label="Edit"
                        title={`Edit ${String(row.name)}`}
                        description="Discounts change on the deal page, where the cap is checked."
                        endpoint={`/api/records/opportunities/${row.id}`}
                        method="PATCH"
                        fields={[
                          { name: "name", label: "Deal name", value: String(row.name), required: true },
                          { name: "stage", label: "Stage", type: "select", value: String(row.stage), options: columns.map((value) => ({ value, label: value })) },
                          { name: "amount", label: "Amount", type: "number", value: String(row.amount) },
                          { name: "ownerId", label: "Owner", type: "select", value: String(row.ownerId), options: [{ value: "user", label: nameOf("user") }, ...owners] },
                        ]}
                      />
                      <DeleteButton small endpoint={`/api/records/opportunities/${row.id}`} name={String(row.name)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="split">
        <section className="panel">
          <div className="panel-head"><h2>Quotes sent</h2><a href="/quotes">All quotes →</a></div>
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
          <div className="panel-head"><h2>{person.approverName ? `Waiting on ${person.approverName}` : "Over the cap"}</h2><a href="/approvals">All approvals →</a></div>
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
