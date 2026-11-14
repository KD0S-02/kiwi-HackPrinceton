import type { Row } from "../lib/data";
import { Icon } from "./Icon";

// Activity on a record, newest first: notes, calls (with how they went) and system lines.
export function Timeline({ entries, nameOf, limit, empty = "Nothing logged yet." }: { entries: Row[]; nameOf: (id: Row[string]) => string; limit?: number; empty?: string }) {
  const shown = limit ? entries.slice(0, limit) : entries;
  if (shown.length === 0) return <p className="empty">{empty}</p>;
  return (
    <ul className="timeline">
      {shown.map((row) => (
        <li key={String(row.id)} className={`kind-${row.kind || "note"}`}>
          <span className="timeline-kind">
            <Icon name={row.kind === "call" ? "phone" : row.kind === "system" ? "bolt" : "note"} size={12} />
            {row.kind === "call" ? "Call" : row.kind === "system" ? "Update" : "Note"}
            {row.outcome ? <em className="pill gray">{String(row.outcome)}</em> : null}
          </span>
          <span className="timeline-text">{String(row.text)}</span>
          {row.at || row.by ? (
            <small>
              {row.by ? nameOf(row.by) : null}
              {row.by && row.at ? " · " : null}
              {row.at ? new Date(String(row.at)).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null}
            </small>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
