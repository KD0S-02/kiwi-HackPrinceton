import { money, type Row } from "../data";

// How an approval's amount reads: a discount is a percent, everything else is dollars.
export function approvalAmount(approval: Row) {
  if (approval.kind === "discount" || approval.kind === "pricing exception") return `${Number(approval.amount ?? 0)}%`;
  if (approval.kind === "hold release") return "—";
  return money(approval.amount);
}

export function ageLabel(at: unknown) {
  if (!at) return "";
  const hours = Math.max(0, Math.round((Date.now() - new Date(String(at)).getTime()) / 3600000));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
