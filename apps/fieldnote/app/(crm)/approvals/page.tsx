import { Pill, RecordLink } from "../../../components/RecordLink";
import { loadNames } from "../../../lib/data";
import { textMatches } from "../../../lib/filters";
import { signedInUser } from "../../../lib/session";
import { subjectOf, subjectTypeOf } from "../../../lib/workflow/approvals";
import { openDb } from "../../../lib/workflow/db";
import { ageLabel, approvalAmount } from "../../../lib/workflow/view";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const person = await signedInUser();
  const db = openDb();
  const [approvals, nameOf] = await Promise.all([db.rows("approvals.json"), loadNames()]);
  const mine = approvals.filter((row) => row.approverId === person.id && row.requestedBy !== person.id);
  const asked = approvals.filter((row) => row.requestedBy === person.id);
  const isApprover = person.book !== "own";
  const view = params.view ?? (isApprover ? "waiting" : "requests");
  const status = params.status ?? (view === "waiting" ? "pending" : "");
  const pool = view === "waiting" ? mine : view === "requests" ? asked : approvals;
  const rows = pool
    .filter((row) => (!status || row.status === status) && textMatches(params.q ?? "", [row.id, row.kind, nameOf(row.accountId), subjectOf(row), nameOf(row.requestedBy)]))
    .sort((a, b) => String(b.requestedAt ?? "").localeCompare(String(a.requestedAt ?? "")) || String(b.id).localeCompare(String(a.id), undefined, { numeric: true }));
  const tabs = [
    { key: "waiting", label: "Waiting on me", count: mine.filter((row) => row.status === "pending").length },
    { key: "requests", label: "My requests", count: asked.filter((row) => row.status === "pending").length },
    { key: "all", label: "All requests", count: approvals.filter((row) => row.status === "pending").length },
  ];

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Approvals</h1>
          <p>Approval requests and who decides them. Discounts and credits go to the requester&apos;s approver; payment plans, credit limits, hold releases and large purchase orders go to finance.</p>
        </div>
      </div>
      <section className="panel" data-kiwi="results">
        <nav className="tabs" style={{ marginBottom: 12 }}>
          {tabs.map((tab) => (
            <a key={tab.key} id={`tab-${tab.key}`} className={view === tab.key ? "active" : ""} href={`/approvals?view=${tab.key}`}>{tab.label}<small>{tab.count}</small></a>
          ))}
        </nav>
        <form className="filter-bar" action="/approvals" data-kiwi="filters">
          <input type="hidden" name="view" value={view} />
          <input name="q" type="search" placeholder="Search approvals" defaultValue={params.q ?? ""} id="filter-q" />
          <select name="status" defaultValue={status} id="filter-status" aria-label="Status">
            <option value="">Any status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <button className="btn ghost small" type="submit">Apply</button>
          <span className="filter-count" id="filter-count">{rows.length} requests</span>
        </form>
        {rows.length === 0 ? <p className="empty">{view === "waiting" ? "Nothing is waiting on you." : "No requests match."}</p> : (
          <div className="scroll tall">
            <table>
              <thead><tr><th>Request</th><th>Kind</th><th>Restaurant</th><th>For</th><th className="num">Amount</th><th>Requested by</th><th>Decides</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={String(row.id)}>
                    <td><a href={`/approvals/${row.id}`}>{String(row.id)}</a><small className="sub">{ageLabel(row.requestedAt)}</small></td>
                    <td>{String(row.kind)}</td>
                    <td>{row.accountId ? <a href={`/accounts/${row.accountId}`}>{nameOf(row.accountId)}</a> : "—"}</td>
                    <td><RecordLink id={subjectOf(row)} kind={subjectTypeOf(row)} /></td>
                    <td className="num">{approvalAmount(row)}</td>
                    <td>{nameOf(row.requestedBy)}</td>
                    <td>{nameOf(row.approverId)}</td>
                    <td><Pill value={row.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}
