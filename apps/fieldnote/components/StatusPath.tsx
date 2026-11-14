// The stage-path strip used on opportunities, reused for cases, quotes, orders and purchase orders.
// A status that is off the path (rejected, held, superseded) takes the last step's place, in red.
export function StatusPath({ steps, current, label = "Status" }: { steps: string[]; current: string; label?: string }) {
  const index = steps.indexOf(current);
  const offPath = index === -1 && !!current;
  const shown = offPath ? [...steps.slice(0, -1), current] : steps;
  const at = offPath ? shown.length - 1 : index;
  return (
    <div className="path" aria-label={label}>
      {shown.map((step, position) => (
        <span key={step} className={position < at && !offPath ? "done" : position === at ? (offPath ? "now off" : "now") : ""}>
          {step[0].toUpperCase() + step.slice(1)}
        </span>
      ))}
    </div>
  );
}
