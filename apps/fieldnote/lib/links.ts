// Where a record id opens. Ids carry their type in the prefix (order-16, invoice-17, cm-1 …).
const routes: [RegExp, string][] = [
  [/^opp-/, "/opportunities/"],
  [/^order-/, "/orders/"],
  [/^invoice-/, "/invoices/"],
  [/^shipment-/, "/shipments/"],
  [/^case-/, "/cases/"],
  [/^quote-/, "/quotes/"],
  [/^po-/, "/purchase-orders/"],
  [/^approval-/, "/approvals/"],
  [/^cm-/, "/credit-memos/"],
  [/^plan-/, "/payment-plans/"],
  [/^pay-/, "/payments/"],
  [/^credit-app-/, "/credit-applications/"],
];

export function hrefFor(id: unknown, kind?: string) {
  const text = String(id ?? "");
  if (!text) return "";
  if (kind === "account") return `/accounts/${text}`;
  if (kind === "opportunity") return `/opportunities/${text}`;
  const match = routes.find(([pattern]) => pattern.test(text));
  return match ? `${match[1]}${text}` : "";
}

// Short display label for an id: "cm-1" reads as "CM-1", the rest stay as they are.
export function idLabel(id: unknown) {
  const text = String(id ?? "");
  return /^cm-\d+$/.test(text) ? text.toUpperCase() : text;
}
