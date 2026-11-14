import { Icon } from "./Icon";
import { Menu } from "./Menu";
import { Logo } from "./Logo";
import { SidebarNav } from "./SidebarNav";
import { loadNames, readRecords } from "../lib/data";
import { seesAll } from "../lib/people";
import { signedInUser } from "../lib/session";

export async function Shell({ children }: { children: React.ReactNode }) {
  const person = await signedInUser();
  const [approvals, cases, nameOf] = await Promise.all([
    readRecords("approvals.json"),
    readRecords("cases.json"),
    loadNames(),
  ]);
  const pending = approvals.filter((row) => row.status === "pending");
  const waitingOnMe = pending.filter((row) => row.approverId === person.id && row.requestedBy !== person.id);
  const subject = (row: (typeof approvals)[number]) => nameOf(row.accountId || row.opportunityId);
  const alerts = [
    ...waitingOnMe.map((row) => ({ id: `w-${row.id}`, href: `/approvals/${row.id}`, title: `${nameOf(row.requestedBy)} needs your decision`, detail: `${String(row.kind)} · ${subject(row)}` })),
    ...pending
      .filter((row) => row.requestedBy === person.id)
      .map((row) => ({ id: `r-${row.id}`, href: `/approvals/${row.id}`, title: `${subject(row)} is waiting on ${nameOf(row.approverId)}`, detail: `${String(row.kind)} request pending` })),
    ...cases
      .filter((row) => row.status !== "closed" && (seesAll(person) || row.ownerId === person.id))
      .map((row) => ({ id: `c-${row.id}`, href: `/cases/${row.id}`, title: `${nameOf(row.accountId)}: ${row.kind}`, detail: `Case ${row.status}` })),
  ];

  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" id="brand" href="/" aria-label="Fieldnote logo, home">
          <Logo size={36} />
          <div>
            <strong>Fieldnote</strong>
            <small>Sales cloud</small>
          </div>
        </a>
        <SidebarNav waiting={waitingOnMe.length} />
        <div className="sidebar-card">
          <strong>{person.name}</strong>
          <span>{person.role} · {person.territory}</span>
          <span>{person.managerName ? `Manager: ${person.managerName}` : "Owner · no manager"}</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <form className="search" action="/search">
            <Icon name="search" size={16} />
            <input name="q" placeholder="Search restaurants, orders, invoices, products" />
          </form>
          <Menu label="Notifications" trigger={<><Icon name="bell" size={17} />{alerts.length > 0 ? <i className="badge">{alerts.length}</i> : null}</>}>
            <div className="menu-head">Notifications</div>
            <div className="menu-scroll">
              {alerts.length === 0 ? <p className="empty pad">You are all caught up.</p> : alerts.map((alert) => (
                <a className="menu-item two" key={alert.id} href={alert.href}>
                  <strong>{alert.title}</strong>
                  <small>{alert.detail}</small>
                </a>
              ))}
            </div>
          </Menu>
          <Menu className="user-btn" label="Account menu" trigger={<><span className="avatar">{person.initials}</span><span className="who"><strong>{person.name}</strong><small>{person.role}</small></span></>}>
            <div className="menu-head">{person.email}</div>
            <a className="menu-item" href="/profile"><Icon name="user" size={15} />Your profile</a>
            <a className="menu-item" href="/company"><Icon name="users" size={15} />Company directory</a>
            <form action="/api/logout" method="post">
              <button className="menu-item" type="submit"><Icon name="logout" size={15} />Log out</button>
            </form>
          </Menu>
        </header>
        <main className="page">{children}</main>
      </div>
    </div>
  );
}
