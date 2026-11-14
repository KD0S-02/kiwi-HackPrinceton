"use client";

import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./Icon";

// Sidebar links carry stable ids (nav-home, nav-accounts …) so Kiwi and recorded skills can click them.
const items: [string, string, IconName][] = [
  ["/", "Home", "home"],
  ["/accounts", "Accounts", "building"],
  ["/pipeline", "Pipeline", "pipeline"],
  ["/orders", "Fulfillment", "truck"],
  ["/supply", "Supply", "box"],
  ["/approvals", "Approvals", "check"],
  ["/company", "Company", "users"],
];

// Lists and records that belong under a main screen, so that screen stays highlighted.
const parents: Record<string, string> = {
  "/contacts": "/accounts",
  "/credit-applications": "/accounts",
  "/quotes": "/pipeline",
  "/opportunities": "/pipeline",
  "/invoices": "/orders",
  "/shipments": "/orders",
  "/cases": "/orders",
  "/credit-memos": "/orders",
  "/payments": "/orders",
  "/payment-plans": "/orders",
  "/products": "/supply",
  "/price-books": "/supply",
  "/inventory": "/supply",
  "/warehouses": "/supply",
  "/suppliers": "/supply",
  "/purchase-orders": "/supply",
  "/people": "/company",
  "/profile": "/company",
};

function isCurrent(pathname: string, href: string) {
  const section = Object.entries(parents).find(([child]) => pathname === child || pathname.startsWith(`${child}/`))?.[1];
  if (section) return section === href;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ waiting = 0 }: { waiting?: number }) {
  const pathname = usePathname() ?? "/";
  return (
    <nav>
      <div className="nav-label">Workspace</div>
      {items.map(([href, label, icon]) => (
        <a key={href} id={href === "/" ? "nav-home" : `nav-${href.slice(1)}`} className={isCurrent(pathname, href) ? "active" : ""} href={href}>
          <Icon name={icon} size={17} />
          {label}
          {href === "/approvals" && waiting > 0 ? <i className="nav-count">{waiting}</i> : null}
        </a>
      ))}
    </nav>
  );
}
