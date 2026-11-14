import { tone } from "../lib/data";
import { hrefFor, idLabel } from "../lib/links";

// A record id that opens its page when it has one.
export function RecordLink({ id, kind, children }: { id: unknown; kind?: string; children?: React.ReactNode }) {
  const href = hrefFor(id, kind);
  const label = children ?? (idLabel(id) || "—");
  return href ? <a href={href}>{label}</a> : <>{label}</>;
}

export function Pill({ value, className = "" }: { value: unknown; className?: string }) {
  if (value == null || value === "") return <span className="pill gray">—</span>;
  return <span className={`pill ${tone(String(value))} ${className}`.trim()}>{String(value)}</span>;
}
