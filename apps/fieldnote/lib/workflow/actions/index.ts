import type { Person } from "../../people";
import { decideApproval } from "../approvals";
import { openDb } from "../db";
import { why } from "../refused";
import { closeCase, issueCredit, logCall, reportShort, scheduleRedelivery } from "./cases";
import { placeHold, proposePlan, recordPayment, releaseHold, releaseOrder, requestRelease } from "./credit";
import { activateAccount, applyCredit, confirmTerritory, setDeliveryDays, setPriceBook, setTax } from "./onboarding";
import { addPoLine, editPoLine, receivePo, releaseBackorders, sendPo, startPo, submitPo } from "./purchasing";
import { acceptQuote, convertQuote, declineQuote, sendQuote, substituteLine } from "./quotes";
import type { Action, Values } from "./types";

const decide: Action = async ({ db, person, values }) => {
  const amount = values.amount ? Number(values.amount) : undefined;
  return { message: await decideApproval(db, person, values.approvalId, values.decision, values.note ?? "", amount) };
};

// Every workflow step, by the name in POST /api/actions/<name>.
export const actions: Record<string, Action> = {
  "decide-approval": decide,
  "report-short": reportShort,
  "schedule-redelivery": scheduleRedelivery,
  "issue-credit": issueCredit,
  "close-case": closeCase,
  "log-call": logCall,
  "substitute-line": substituteLine,
  "send-quote": sendQuote,
  "accept-quote": acceptQuote,
  "decline-quote": declineQuote,
  "convert-quote": convertQuote,
  "propose-plan": proposePlan,
  "record-payment": recordPayment,
  "place-hold": placeHold,
  "request-release": requestRelease,
  "release-hold": releaseHold,
  "release-order": releaseOrder,
  "start-po": startPo,
  "add-po-line": addPoLine,
  "edit-po-line": editPoLine,
  "submit-po": submitPo,
  "send-po": sendPo,
  "receive-po": receivePo,
  "release-backorders": releaseBackorders,
  "confirm-territory": confirmTerritory,
  "set-price-book": setPriceBook,
  "set-delivery-days": setDeliveryDays,
  "set-tax": setTax,
  "apply-credit": applyCredit,
  "activate-account": activateAccount,
};

// Runs the action on a throwaway copy and returns the sentence it would refuse with ("" when it
// would go ahead). Pages use it so a disabled button shows exactly what the server would say.
export async function preflight(name: string, person: Person, values: Values) {
  const action = actions[name];
  if (!action) return "That action does not exist.";
  return why(() => action({ db: openDb(), person, values }));
}
