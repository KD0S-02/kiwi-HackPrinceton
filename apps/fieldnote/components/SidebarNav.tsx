"use client";

import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./Icon";

const items: [string, string, IconName][] = [
  ["/", "Home", "home"],
  ["/accounts", "Accounts", "building"],
  ["/pipeline", "Pipeline", "pipeline"],
  ["/orders", "Fulfillment", "truck"],
  ["/supply", "Supply", "box"],
  ["/company", "Company", "users"],
];

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

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav>
      <div className="nav-label">Workspace</div>
      {items.map(([href, label, icon]) => (
        <a key={href} id={href === "/" ? "nav-home" : `nav-${href.slice(1)}`} className={isCurrent(pathname, href) ? "active" : ""} href={href}>
          <Icon name={icon} size={17} />
          {label}
        </a>
      ))}
    </nav>
  );
}
