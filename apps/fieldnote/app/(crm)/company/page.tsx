import { ExportLink } from "../../../components/ExportLink";
import { loadNames, money, readRecords } from "../../../lib/data";
import { signedInUser } from "../../../lib/session";

export const dynamic = "force-dynamic";

export default async function CompanyPage() {
  const [employees, accounts, opportunities, territories, offices, nameOf] = await Promise.all([
    readRecords("employees.json"),
    readRecords("accounts.json"),
    readRecords("opportunities.json"),
    readRecords("territories.json"),
    readRecords("offices.json"),
    loadNames(),
  ]);
  const byTerritory = territories.map((territory) => {
    const book = accounts.filter((account) => account.territoryId === territory.id);
    const deals = opportunities.filter((deal) => book.some((account) => account.id === deal.accountId));
    return { territory, book: book.length, deals: deals.length, amount: deals.reduce((sum, deal) => sum + Number(deal.amount), 0) };
  });
  const viewer = await signedInUser();
  const widest = Math.max(...byTerritory.map((row) => row.amount), 1);

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Company</h1>
          <p>{employees.length} people in {offices.length} offices. {viewer.managerName ? `${viewer.name} reports to ${viewer.managerName}.` : `${viewer.name} owns Fieldnote.`}</p>
        </div>
        <div className="actions">
          <a className="btn ghost" href="/people">Roster</a>
          <ExportLink name="people" label="Export roster" />
        </div>
      </div>

      <div className="stats">
        <article className="card stat"><span>People</span><strong>{employees.length}</strong><em>{offices.length} offices</em></article>
        <article className="card stat tone-indigo"><span>Territories</span><strong>{territories.length}</strong><em>{accounts.length} restaurants</em></article>
        <article className="card stat tone-green"><span>Company pipeline</span><strong>{money(opportunities.reduce((sum, row) => sum + Number(row.amount), 0))}</strong><em>{opportunities.length} open deals</em></article>
        <article className="card stat tone-amber"><span>Sales team</span><strong>{employees.filter((row) => row.department === "sales").length}</strong><em>reps and managers</em></article>
      </div>

      <section className="panel">
        <div className="panel-head"><h2>Pipeline by territory</h2><span>open amount</span></div>
        <div className="territory-bars">
          {byTerritory.map((row) => (
            <div className="territory-row" key={String(row.territory.id)}>
              <div>
                <strong>{String(row.territory.name)}</strong>
                <span>{row.book} restaurants · {row.deals} deals · {nameOf(row.territory.officeId)}</span>
              </div>
              <i style={{ width: `${(row.amount / widest) * 100}%` }} />
              <em>{money(row.amount)}</em>
            </div>
          ))}
        </div>
      </section>

      <div className="offices">
        {offices.map((office) => {
          const people = employees.filter((person) => person.officeId === office.id);
          return (
            <section className="panel" key={String(office.id)}>
              <div className="panel-head"><h2>{String(office.name)}</h2><span>{people.length} people</span></div>
              <div className="scroll tall">
                {people.map((person) => (
                  <div className={person.id === viewer.id ? "person you" : "person"} key={String(person.id)}>
                    <span className="avatar">{String(person.name).slice(0, 1)}</span>
                    <div>
                      <strong>{String(person.name)}</strong>
                      <small>{String(person.role)}{person.reportsTo ? ` · reports to ${nameOf(person.reportsTo)}` : ""}</small>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
