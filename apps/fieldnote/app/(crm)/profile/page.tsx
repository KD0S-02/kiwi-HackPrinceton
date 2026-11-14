import { loadNames, readRecords, readRules } from "../../../lib/data";
import { seesAll } from "../../../lib/people";
import { signedInUser } from "../../../lib/session";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const [employees, accounts, rules, nameOf] = await Promise.all([
    readRecords("employees.json"),
    readRecords("accounts.json"),
    readRules(),
    loadNames(),
  ]);
  const person = await signedInUser();
  const me = employees.find((row) => row.id === person.id);
  const reports = employees.filter((row) => row.reportsTo === person.id);
  const mine = seesAll(person) ? accounts : accounts.filter((row) => row.ownerId === person.id);

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Your profile</h1>
          <p>Your account, your manager, and what you are allowed to do in Fieldnote.</p>
        </div>
        <form action="/api/logout" method="post">
          <button className="btn ghost" type="submit">Log out</button>
        </form>
      </div>
      <div className="profile">
        <section className="panel profile-card">
          <span className="avatar">{person.initials}</span>
          <h2>{String(me?.name ?? person.name)}</h2>
          <p className="empty">{String(me?.role ?? person.role)} · {nameOf(me?.officeId)}</p>
          <p className="empty">{person.email}</p>
        </section>
        <div style={{ display: "grid", gap: 16 }}>
          <section className="panel">
            <h2 style={{ marginBottom: 8 }}>Work</h2>
            <dl className="facts">
              <dt>Manager</dt><dd>{person.managerName || "None"}</dd>
              <dt>Territory</dt><dd>{nameOf(me?.territoryId)}</dd>
              <dt>Office</dt><dd>{nameOf(me?.officeId)}</dd>
              <dt>Restaurants</dt><dd>{mine.length}</dd>
              <dt>Direct reports</dt><dd>{reports.length === 0 ? "None" : reports.map((row) => String(row.name)).join(", ")}</dd>
            </dl>
          </section>
          <section className="panel">
            <h2 style={{ marginBottom: 8 }}>What you can do</h2>
            <dl className="facts">
              <dt>Send a quote</dt><dd>{person.book === "company" ? "You see every quote. You don't send a rep's quote." : seesAll(person) ? "You review the team's quotes. You don't send them." : "On your own opportunities"}</dd>
              <dt>Discount</dt><dd>{person.approverName ? `Up to ${rules.discountCapPercent} percent. ${person.approverName} approves anything higher.` : `Anything over ${rules.discountCapPercent} percent stops with you.`}</dd>
            </dl>
          </section>
        </div>
      </div>
    </section>
  );
}
