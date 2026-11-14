import { headers } from "next/headers";
import { Icon, type IconName } from "./Icon";
import { Menu } from "./Menu";
import { Logo } from "./Logo";
import { currentUser, loadNames, nav, readRecords } from "../lib/data";

const icons: Record<string, IconName> = {
  "/": "home",
  "/accounts": "building",
  "/pipeline": "pipeline",
  "/orders": "truck",
  "/supply": "box",
  "/company": "users",
};

const parents: Record<string, string> = {
  "/contacts": "/accounts",
  "/quotes": "/pipeline",
  "/approvals": "/pipeline",
  "/invoices": "/orders",
  "/shipments": "/orders",
  "/cases": "/orders",
  "/products": "/supply",
  "/price-books": "/supply",
  "/inventory": "/supply",
  "/warehouses": "/supply",
  "/suppliers": "/supply",
  "/purchase-orders": "/supply",
  "/people": "/company",
};

function isCurrent(pathname: string, href: string) {
  const section = Object.entries(parents).find(([child]) => pathname === child || pathname.startsWith(`${child}/`))?.[1];
  if (section) return section === href;
  if (href === "/") return pathname === "/";
  if (href === "/pipeline") return pathname === "/pipeline" || pathname.startsWith("/opportunities");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export async function Shell({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get("x-pathname") ?? "/";
  const [approvals, cases, nameOf] = await Promise.all([
    readRecords("approvals.json"),
    readRecords("cases.json"),
    loadNames(),
  ]);
  const alerts = [
    ...approvals
      .filter((row) => row.requestedBy === "user" && row.status === "pending")
      .map((row) => ({ id: String(row.id), href: `/opportunities/${row.opportunityId}`, title: `${nameOf(row.opportunityId)} is waiting on Alex Morgan (your manager)`, detail: "Discount approval pending" })),
    ...cases
      .filter((row) => row.ownerId === "user" && row.status === "open")
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
        <nav>
          <div className="nav-label">Workspace</div>
          {nav.map(([href, label]) => (
            <a key={href} className={isCurrent(pathname, href) ? "active" : ""} href={href}>
              <Icon name={icons[href]} size={17} />
              {label}
            </a>
          ))}
        </nav>
        <div className="sidebar-card">
          <strong>Northeast</strong>
          <span>Jersey City office</span>
          <span>Your manager: Alex Morgan</span>
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
          <Menu className="user-btn" label="Account menu" trigger={<><span className="avatar">{currentUser.initials}</span><span className="who"><strong>{currentUser.name}</strong><small>Account executive</small></span></>}>
            <div className="menu-head">{currentUser.email}</div>
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
