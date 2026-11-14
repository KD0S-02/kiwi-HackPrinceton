import { currentUser, loadNames, readRecords, readRules } from "../../../lib/data";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const [employees, accounts, rules, nameOf] = await Promise.all([
    readRecords("employees.json"),
    readRecords("accounts.json"),
    readRules(),
    loadNames(),
  ]);
  const me = employees.find((row) => row.id === "user");
  const reports = employees.filter((row) => row.reportsTo === "user");
  const mine = accounts.filter((row) => row.ownerId === "user");

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
          <span className="avatar">{currentUser.initials}</span>
          <h2>{String(me?.name ?? currentUser.name)}</h2>
          <p className="empty">{String(me?.role ?? "")} · {nameOf(me?.officeId)}</p>
          <p className="empty">{currentUser.email}</p>
        </section>
        <div style={{ display: "grid", gap: 16 }}>
          <section className="panel">
            <h2 style={{ marginBottom: 8 }}>Work</h2>
            <dl className="facts">
              <dt>Manager</dt><dd>{nameOf(me?.reportsTo)}</dd>
              <dt>Territory</dt><dd>{nameOf(me?.territoryId)}</dd>
              <dt>Office</dt><dd>{nameOf(me?.officeId)}</dd>
              <dt>Restaurants</dt><dd>{mine.length}</dd>
              <dt>Direct reports</dt><dd>{reports.length === 0 ? "None" : reports.map((row) => String(row.name)).join(", ")}</dd>
            </dl>
          </section>
          <section className="panel">
            <h2 style={{ marginBottom: 8 }}>What you can do</h2>
            <dl className="facts">
              <dt>Send a quote</dt><dd>On your own opportunities</dd>
              <dt>Discount</dt><dd>Up to {rules.discountCapPercent} percent. Your manager, Alex Morgan, approves anything higher.</dd>
            </dl>
          </section>
        </div>
      </div>
    </section>
  );
}
