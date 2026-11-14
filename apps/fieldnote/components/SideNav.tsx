"use client";

import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./Icon";

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

// Client side, so the highlight follows in-app navigation and not only full page loads.
export function SideNav({ items }: { items: readonly (readonly [string, string])[] }) {
  const pathname = usePathname() ?? "/";
  return (
    <nav>
      <div className="nav-label">Workspace</div>
      {items.map(([href, label]) => (
        <a key={href} className={isCurrent(pathname, href) ? "active" : ""} href={href}>
          <Icon name={icons[href]} size={17} />
          {label}
        </a>
      ))}
    </nav>
  );
}
