import { Icon } from "./Icon";
import { Menu } from "./Menu";
import { Logo } from "./Logo";
import { SideNav } from "./SideNav";
import { loadNames, nav, readRecords } from "../lib/data";
import { seesAll } from "../lib/people";
import { signedInUser } from "../lib/session";

export async function Shell({ children }: { children: React.ReactNode }) {
  const person = await signedInUser();
  const [approvals, cases, nameOf] = await Promise.all([
    readRecords("approvals.json"),
    readRecords("cases.json"),
    loadNames(),
  ]);
  const alerts = [
    ...approvals
      .filter((row) => row.requestedBy === person.id && row.status === "pending")
      .map((row) => ({ id: String(row.id), href: `/opportunities/${row.opportunityId}`, title: `${nameOf(row.opportunityId)} is waiting on ${person.approverName || "you"}`, detail: "Discount approval pending" })),
    ...cases
      .filter((row) => row.status === "open" && (seesAll(person) || row.ownerId === person.id))
      .map((row) => ({ id: String(row.id), href: `/accounts/${row.accountId}`, title: `${nameOf(row.accountId)}: ${row.kind}`, detail: "Open case" })),
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
        <SideNav items={nav} />
        <div className="sidebar-card">
          <strong>{person.territory}</strong>
          <span>{person.office} office</span>
          <span>{person.managerName ? `Your manager: ${person.managerName}` : "Owner"}</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <form className="search" action="/search">
            <Icon name="search" size={16} />
            <input name="q" placeholder="Search restaurants, buyers, products" />
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
