// Server rules for the five Fieldnote workflows, through the real HTTP API, as each person.
// Needs Fieldnote running (cd apps/fieldnote && npm run dev). It snapshots data/records and
// data/rules.json first and puts them back at the end, even when a check fails.
//
//   npx tsx scripts/check-workflows.ts
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { dataDirectory, recordsDirectory } from "./paths.ts";

type Row = Record<string, string | number | null>;
type Who = "user" | "shail-shah" | "krishna-das";
const base = process.env.FIELDNOTE_URL ?? "http://localhost:3000";
let passed = 0;
const failures: string[] = [];

function check(label: string, ok: boolean, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`pass  ${label}`);
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function hashRecords() {
  const hash = createHash("sha1");
  for (const file of (await readdir(recordsDirectory)).sort()) hash.update(file).update(await readFile(path.join(recordsDirectory, file)));
  return hash.digest("hex");
}

async function call(who: Who, method: string, url: string, body?: unknown) {
  const response = await fetch(`${base}${url}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: `fieldnote_session=${who}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = { text };
  }
  return { status: response.status, json, text: String(json.error ?? json.message ?? json.text ?? "") };
}

const act = (who: Who, name: string, values: Record<string, unknown>) => call(who, "POST", `/api/actions/${name}`, { values });
const create = (who: Who, module: string, values: Record<string, unknown>) => call(who, "POST", `/api/records/${module}`, { values });

async function ok(label: string, run: Promise<{ status: number; text: string; json: Record<string, unknown> }>) {
  const result = await run;
  check(label, result.status >= 200 && result.status < 300, `${result.status} ${result.text}`);
  return result;
}

// A refusal must say the expected words and leave every record file untouched.
async function refused(label: string, words: string, run: () => Promise<{ status: number; text: string }>) {
  const before = await hashRecords();
  const result = await run();
  const after = await hashRecords();
  check(label, result.status >= 400 && result.text.toLowerCase().includes(words.toLowerCase()) && before === after, `${result.status} "${result.text}"${before === after ? "" : " (files changed)"}`);
}

const rows = async (file: string): Promise<Row[]> => JSON.parse(await readFile(path.join(recordsDirectory, file), "utf8"));
const row = async (file: string, id: string) => (await rows(file)).find((item) => item.id === id);
const day = (offset: number) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const nextOn = (names: string[], skip = 0) => {
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const found: string[] = [];
  for (let offset = 1; found.length <= skip; offset += 1) {
    if (names.includes(labels[new Date(`${day(offset)}T12:00:00`).getDay()])) found.push(day(offset));
  }
  return found[skip];
};
const free = async (productId: string, warehouseId: string) => {
  const [inventory, orders, lines, shipments, shipmentLines] = await Promise.all(["inventory", "orders", "order-lines", "shipments", "shipment-lines"].map((name) => rows(`${name}.json`)));
  const reserving = new Set(orders.filter((order) => ["open", "backordered", "picking"].includes(String(order.status))).map((order) => String(order.id)));
  const scheduled = new Set(shipments.filter((item) => item.status === "scheduled" && item.warehouseId === warehouseId).map((item) => String(item.id)));
  const onHand = Number(inventory.find((item) => item.productId === productId && item.warehouseId === warehouseId)?.onHand ?? 0);
  const reserved = lines.filter((line) => line.productId === productId && reserving.has(String(line.orderId)) && (line.warehouseId || orders.find((order) => order.id === line.orderId)?.warehouseId) === warehouseId).reduce((sum, line) => sum + Number(line.allocated ?? 0), 0)
    + shipmentLines.filter((line) => line.productId === productId && scheduled.has(String(line.shipmentId))).reduce((sum, line) => sum + Number(line.quantity), 0);
  return onHand - reserved;
};
const approvalFor = async (subjectId: string) => (await rows("approvals.json")).filter((item) => item.subjectId === subjectId).at(-1);

async function workflow1() {
  console.log("\n— workflow 1: Dockside Bowls short delivery");
  const gloves = "sl-shipment-11-gloves";
  const fryer = "sl-shipment-11-fryer-oil";
  await refused("Shail cannot report a short on Sparsh's restaurant", "belongs to Sparsh Bohra", () => act("shail-shah", "report-short", { shipmentLineId: gloves, short: 4 }));
  await refused("a short larger than the line is refused", "can still be reported", () => act("user", "report-short", { shipmentLineId: gloves, short: 11 }));
  await refused("Krishna may report (refused only on quantity)", "can still be reported", () => act("krishna-das", "report-short", { shipmentLineId: gloves, short: 99 }));
  await ok("Sparsh reports 4 gloves short", act("user", "report-short", { shipmentLineId: gloves, short: 4 }));
  await ok("Sparsh reports 18 fryer oil short", act("user", "report-short", { shipmentLineId: fryer, short: 18 }));
  check("case-13 is investigating", (await row("cases.json", "case-13"))?.status === "investigating");
  await refused("redelivering 18 fryer oil is refused", "only 6 fryer oil free", () => act("user", "schedule-redelivery", { shipmentLineId: fryer, quantity: 18, date: nextOn(["Tue", "Fri"]) }));
  await refused("a Wednesday redelivery is refused", "tue and fri only", () => act("user", "schedule-redelivery", { shipmentLineId: gloves, quantity: 4, date: nextOn(["Wed"]) }));
  const glovesBefore = await free("gloves", "newark-dry-goods");
  await ok("Sparsh redelivers 4 gloves on the next delivery day", act("user", "schedule-redelivery", { shipmentLineId: gloves, quantity: 4, date: nextOn(["Tue", "Fri"]) }));
  check("gloves free drops by 4", (await free("gloves", "newark-dry-goods")) === glovesBefore - 4, `${glovesBefore} → ${await free("gloves", "newark-dry-goods")}`);
  await refused("crediting the redelivered gloves is refused", "already on a redelivery", () => act("user", "issue-credit", { invoiceId: "invoice-16", shipmentLineId: gloves, quantity: 4, reason: "short" }));
  await refused("closing with an open short is refused", "fryer oil still has 18 short", () => act("user", "close-case", { caseId: "case-13", resolution: "both" }));
  const credit = await ok("Sparsh credits 18 fryer oil", act("user", "issue-credit", { invoiceId: "invoice-16", shipmentLineId: fryer, quantity: 18, reason: "short" }));
  check("the credit goes to Shail", /Sent to Shail Shah/.test(credit.text), credit.text);
  const memoId = String(credit.json.id);
  const memo = await row("credit-memos.json", memoId);
  check("the memo is pending at about $142", memo?.status === "pending approval" && Math.abs(Number(memo?.amount) - 141.84) < 0.01, JSON.stringify(memo));
  await refused("a second fryer oil credit while one is pending is refused", "already waiting on Shail Shah", () => act("user", "issue-credit", { invoiceId: "invoice-16", shipmentLineId: fryer, quantity: 1, reason: "short" }));
  await refused("closing while the memo is pending is refused", "waiting on shail shah to approve cm-", () => act("user", "close-case", { caseId: "case-13", resolution: "both" }));
  const approval = await approvalFor(memoId);
  await refused("Sparsh cannot approve his own request", "your own request", () => act("user", "decide-approval", { approvalId: approval?.id, decision: "approved" }));
  const balanceBefore = Number((await row("invoices.json", "invoice-16"))?.amount) - Number((await row("invoices.json", "invoice-16"))?.credited ?? 0);
  await ok("Shail approves the credit", act("shail-shah", "decide-approval", { approvalId: approval?.id, decision: "approved" }));
  const invoice = await row("invoices.json", "invoice-16");
  check("the invoice balance drops by the memo", Math.abs(Number(invoice?.amount) - Number(invoice?.credited) - (balanceBefore - 141.84)) < 0.01 && (await row("credit-memos.json", memoId))?.status === "posted");
  await refused("approving twice is refused", "already approved", () => act("shail-shah", "decide-approval", { approvalId: approval?.id, decision: "approved" }));
  await ok("Sparsh logs the call", act("user", "log-call", { subjectType: "account", subjectId: "dockside-bowls", outcome: "resolved", text: "Told the buyer gloves come on the next truck and the oil is credited." }));
  await ok("Sparsh closes the case", act("user", "close-case", { caseId: "case-13", resolution: "both" }));
  check("case-13 is closed", (await row("cases.json", "case-13"))?.status === "closed");
  await ok("Krishna reports 2 napkins short", act("krishna-das", "report-short", { shipmentLineId: "sl-shipment-11-napkins", short: 2 }));
  const small = await ok("a credit of $100 or less posts at once", act("krishna-das", "issue-credit", { invoiceId: "invoice-16", shipmentLineId: "sl-shipment-11-napkins", quantity: 2, reason: "short" }));
  check("…and is posted", (await row("credit-memos.json", String(small.json.id)))?.status === "posted");
}

async function workflow2() {
  console.log("\n— workflow 2: North Fork Grill quote to order");
  const opp = "opp-north-fork-grill";
  const line = await ok("Sparsh adds 24 fryer oil", create("user", "line-items", { opportunityId: opp, productId: "fryer-oil", quantity: 24 }));
  const lineId = String(line.json.id);
  check("the line uses the Northeast price", Number((await row("line-items.json", lineId))?.unitPrice) === 7.88);
  await refused("sending while fryer oil is short is refused", "6 free for 24", () => call("user", "POST", `/api/opportunities/${opp}/send`));
  await refused("a substitute from another family is refused", "same family", () => act("user", "substitute-line", { lineItemId: lineId, productId: "cheddar", buyerAgreed: "yes" }));
  await refused("a substitute without the buyer is refused", "buyer has to agree", () => act("user", "substitute-line", { lineItemId: lineId, productId: "canola", buyerAgreed: "" }));
  await refused("a substitute with too little stock is refused", "free at", () => act("user", "substitute-line", { lineItemId: lineId, productId: "spray", buyerAgreed: "yes" }));
  await ok("Sparsh substitutes canola (buyer agreed)", act("user", "substitute-line", { lineItemId: lineId, productId: "canola", buyerAgreed: "yes" }));
  await refused("Shail cannot send Sparsh's quote", "own opportunities", () => call("shail-shah", "POST", `/api/opportunities/${opp}/send`));
  await ok("Sparsh sends the quote", call("user", "POST", `/api/opportunities/${opp}/send`));
  const quotes = () => rows("quotes.json").then((all) => all.filter((item) => item.opportunityId === opp).sort((a, b) => Number(a.version ?? 1) - Number(b.version ?? 1)));
  const first = (await quotes()).at(-1)!;
  check("the quote copies its lines", (await rows("quote-lines.json")).some((item) => item.quoteId === first.id && item.productId === "canola"));
  await ok("Sparsh adds napkins", create("user", "line-items", { opportunityId: opp, productId: "napkins", quantity: 6 }));
  await ok("Sparsh sends again", call("user", "POST", `/api/opportunities/${opp}/send`));
  const all = await quotes();
  const latest = all.at(-1)!;
  check("the new version supersedes the old one", Number(latest.version) === Number(first.version) + 1 && (await row("quotes.json", String(first.id)))?.status === "superseded");
  await refused("accepting an older version is refused", `version ${first.version} was replaced`, () => act("user", "accept-quote", { quoteId: first.id, contactId: "contact-north-fork-grill", buyerPo: "PO-1" }));
  await refused("converting before acceptance is refused", "accepted before", () => act("user", "convert-quote", { quoteId: latest.id, deliveryDate: nextOn(["Tue", "Fri"]) }));
  await ok("Sparsh marks the latest version accepted", act("user", "accept-quote", { quoteId: latest.id, contactId: "contact-north-fork-grill", buyerPo: "NFG-2291" }));
  await refused("converting to a non-delivery day is refused", "pick a delivery date", () => act("user", "convert-quote", { quoteId: latest.id, deliveryDate: nextOn(["Wed"]) }));
  const canolaBefore = await free("canola", "newark-dry-goods");
  const order = await ok("Sparsh converts it to an order", act("user", "convert-quote", { quoteId: latest.id, deliveryDate: nextOn(["Tue", "Fri"]) }));
  const created = await row("orders.json", String(order.json.id));
  check("the order is open with allocated lines", created?.status === "open" && (await rows("order-lines.json")).filter((item) => item.orderId === created?.id).every((item) => Number(item.allocated) === Number(item.quantity)));
  check("canola free drops by 24", (await free("canola", "newark-dry-goods")) === canolaBefore - 24);
  check("the quote is converted and the deal is Closed Won", (await row("quotes.json", String(latest.id)))?.status === "converted" && (await row("opportunities.json", opp))?.stage === "Closed Won");

  console.log("  discount approval (Red Kettle)");
  const red = "opp-red-kettle";
  await ok("Sparsh sets 18 percent", call("user", "POST", `/api/opportunities/${red}/discount`, { discountPercent: 18 }));
  await ok("Sparsh adds sugar", create("user", "line-items", { opportunityId: red, productId: "sugar", quantity: 5 }));
  await refused("send at 18 percent is refused", "stops at 15 percent", () => call("user", "POST", `/api/opportunities/${red}/send`));
  const request = await ok("Sparsh requests approval", create("user", "approvals", { opportunityId: red, kind: "discount" }));
  await ok("Shail approves the discount", act("shail-shah", "decide-approval", { approvalId: request.json.id, decision: "approved" }));
  await ok("send at 18 percent now works", call("user", "POST", `/api/opportunities/${red}/send`));
  await ok("Sparsh raises it to 19", call("user", "POST", `/api/opportunities/${red}/discount`, { discountPercent: 19 }));
  await refused("send at 19 percent is refused", "stops at 15 percent", () => call("user", "POST", `/api/opportunities/${red}/send`));
  await refused("Harbor Diner is still refused at 20 percent", "An account executive stops at 15 percent. Shail Shah has to approve the rest.", () => call("user", "POST", "/api/opportunities/opp-harbor-diner/send"));
}

async function workflow3() {
  console.log("\n— workflow 3: Juniper Deli credit hold");
  await refused("a new order on hold is refused", "on credit hold: invoice-17 is past due", () => create("user", "orders", { accountId: "juniper-deli", amount: 200 }));
  await ok("Sparsh logs a collections call", act("user", "log-call", { subjectType: "invoice", subjectId: "invoice-17", outcome: "promised to pay", text: "Owner will pay in installments." }));
  await refused("Sparsh cannot record a payment", "finance posts payments", () => act("user", "record-payment", { invoiceId: "invoice-17", amount: 100, method: "check" }));
  await refused("release before a plan is refused", "no active payment plan", () => act("user", "request-release", { accountId: "juniper-deli" }));
  await refused("a first date more than 30 days out is refused", "within the next 30 days", () => act("user", "propose-plan", { invoiceId: "invoice-17", installments: 4, firstDate: day(40) }));
  const plan = await ok("Sparsh proposes 4 installments", act("user", "propose-plan", { invoiceId: "invoice-17", installments: 4, firstDate: day(3) }));
  check("the plan waits on Krishna", /Krishna Das/.test(plan.text) && (await row("payment-plans.json", String(plan.json.id)))?.status === "pending approval", plan.text);
  await refused("a second plan is refused", "already has a payment plan", () => act("user", "propose-plan", { invoiceId: "invoice-17", installments: 2, firstDate: day(3) }));
  await refused("Shail cannot decide a finance request", "decides this request", async () => act("shail-shah", "decide-approval", { approvalId: (await approvalFor(String(plan.json.id)))?.id, decision: "approved" }));
  await ok("Krishna approves the plan", act("krishna-das", "decide-approval", { approvalId: (await approvalFor(String(plan.json.id)))?.id, decision: "approved" }));
  await refused("release before the first installment is refused", "first installment is not paid", () => act("user", "request-release", { accountId: "juniper-deli" }));
  await refused("a payment over the balance is refused", "more than the $1,840", () => act("krishna-das", "record-payment", { invoiceId: "invoice-17", amount: 5000, method: "check" }));
  await ok("Krishna records the first installment", act("krishna-das", "record-payment", { invoiceId: "invoice-17", amount: 460, method: "check", reference: "Check 1042" }));
  const release = await ok("Sparsh requests the release", act("user", "request-release", { accountId: "juniper-deli" }));
  check("the release goes to Krishna", /Krishna Das/.test(release.text), release.text);
  await refused("releasing the order while on hold is refused", "still on credit hold", () => act("user", "release-order", { orderId: "order-18" }));
  await refused("Shail cannot place a hold", "finance posts payments", () => act("shail-shah", "place-hold", { accountId: "harbor-diner", reason: "test" }));
  await ok("Krishna approves the release", act("krishna-das", "decide-approval", { approvalId: (await approvalFor("juniper-deli"))?.id, decision: "approved" }));
  check("the hold is cleared", (await row("accounts.json", "juniper-deli"))?.creditHold === "");
  await ok("Sparsh releases order-18", act("user", "release-order", { orderId: "order-18" }));
  check("order-18 is open and reserves rice", (await row("orders.json", "order-18"))?.status === "open" && Number((await row("order-lines.json", "ol-order-18-1"))?.allocated) === 20);
  await ok("Krishna records the rest", act("krishna-das", "record-payment", { invoiceId: "invoice-17", amount: 1380, method: "ACH" }));
  check("the invoice is paid and the plan completed", (await row("invoices.json", "invoice-17"))?.status === "paid" && (await row("payment-plans.json", String(plan.json.id)))?.status === "completed");
}

async function workflow4() {
  console.log("\n— workflow 4: fryer oil purchase order");
  await refused("Sparsh cannot start a PO", "account executives do not receive", () => act("user", "start-po", { inventoryId: "inv-fryer-oil" }));
  const start = await ok("Krishna starts a PO from the fryer oil row", act("krishna-das", "start-po", { inventoryId: "inv-fryer-oil" }));
  const po = String(start.json.id);
  const line = (await rows("purchase-order-lines.json")).find((item) => item.poId === po);
  check("Harbor Mills, 72 jugs, $324", (await row("purchase-orders.json", po))?.supplierId === "harbor-mills" && Number(line?.quantity) === 72 && Number((await row("purchase-orders.json", po))?.total) === 324, JSON.stringify(line));
  await refused("a second draft is refused", "already a draft", () => act("krishna-das", "start-po", { inventoryId: "inv-fryer-oil" }));
  await refused("submitting under the minimum is refused", "Harbor Mills needs $500. This order is $324.", () => act("krishna-das", "submit-po", { poId: po }));
  await refused("a line from another supplier is refused", "comes from Northline Foods", () => act("krishna-das", "add-po-line", { poId: po, productId: "canola", quantity: 5 }));
  const cold = await ok("Krishna makes a Harbor Mills draft into Jersey City cold", create("krishna-das", "purchase-orders", { supplierId: "harbor-mills", warehouseId: "jersey-city-cold" }));
  await refused("oil into Jersey City cold is refused", "Jersey City cold only receives dairy", () => act("krishna-das", "add-po-line", { poId: cold.json.id, productId: "olive-oil", quantity: 5 }));
  await ok("Krishna adds 12 olive oil", act("krishna-das", "add-po-line", { poId: po, productId: "olive-oil", quantity: 12 }));
  await refused("sending before approval is refused", "has to be approved", () => act("krishna-das", "send-po", { poId: po }));
  await ok("Krishna submits", act("krishna-das", "submit-po", { poId: po }));
  check("under $5,000 it is approved", (await row("purchase-orders.json", po))?.status === "approved");
  await refused("editing after submit is refused", "only a draft can change", () => act("krishna-das", "edit-po-line", { lineId: line?.id, quantity: 10 }));
  await ok("Krishna sends it", act("krishna-das", "send-po", { poId: po }));
  check("it has an expected date", !!(await row("purchase-orders.json", po))?.expectedDate);
  await refused("receiving more than ordered is refused", "still due", () => act("krishna-das", "receive-po", { poId: po, [`received:${line?.id}`]: 100 }));
  await refused("Sparsh cannot receive", "account executives do not receive", () => act("user", "receive-po", { poId: po, [`received:${line?.id}`]: 1 }));
  await ok("Krishna receives 40 fryer oil", act("krishna-das", "receive-po", { poId: po, [`received:${line?.id}`]: 40 }));
  check("partially received, on hand 64", (await row("purchase-orders.json", po))?.status === "partially received" && Number((await row("inventory.json", "inv-fryer-oil"))?.onHand) === 64);
  await ok("Krishna releases fryer oil backorders", act("krishna-das", "release-backorders", { productId: "fryer-oil", warehouseId: "newark-dry-goods" }));
  check("order-20 is open with 12 allocated", (await row("orders.json", "order-20"))?.status === "open" && Number((await row("order-lines.json", "ol-order-20-1"))?.allocated) === 12);
  const olive = (await rows("purchase-order-lines.json")).find((item) => item.poId === po && item.productId === "olive-oil");
  await ok("Krishna receives the rest", act("krishna-das", "receive-po", { poId: po, [`received:${line?.id}`]: 32, [`received:${olive?.id}`]: 12 }));
  check("the PO is received", (await row("purchase-orders.json", po))?.status === "received");
}

async function workflow5() {
  console.log("\n— workflow 5: onboarding Saltwater Kitchen");
  const made = await ok("Sparsh creates Saltwater Kitchen at 07302", create("user", "accounts", { name: "Saltwater Kitchen", zip: "07302" }));
  const id = String(made.json.id);
  const account = await row("accounts.json", id);
  check("name and ZIP finish it: active, Northeast, Jersey City cold, Tue|Fri, $2,000", account?.status === "active" && account?.territoryId === "northeast" && account?.warehouseId === "jersey-city-cold" && account?.priceBookId === "northeast" && account?.deliveryDays === "Tue|Fri" && account?.taxStatus === "taxable" && Number(account?.creditLimit) === 2000, JSON.stringify(account));
  await ok("a $1,500 order goes through", create("user", "orders", { accountId: id, amount: 1500 }));
  await refused("an order over the credit limit is refused", "over Saltwater Kitchen's available credit", () => create("user", "orders", { accountId: id, amount: 900 }));
  await refused("a warehouse in another office is refused", "Chicago dry does not serve the Northeast", () => call("user", "PATCH", `/api/records/accounts/${id}`, { values: { warehouseId: "chicago-dry" } }));
  const nowhere = await ok("Sparsh creates an account at ZIP 99999", create("user", "accounts", { name: "Nowhere Diner", zip: "99999" }));
  await refused("an unknown ZIP is refused", "No territory covers ZIP 99999", () => act("user", "confirm-territory", { accountId: nowhere.json.id }));
  const big = await ok("Sparsh creates Tidewater Grill", create("user", "accounts", { name: "Tidewater Grill", zip: "08540" }));
  await ok("…with an AP contact", create("user", "contacts", { accountId: big.json.id, name: "Lee Park", role: "accounts payable", email: "ap@tidewater.example" }));
  const app = await ok("$6,000 of credit goes to Krishna", act("user", "apply-credit", { accountId: big.json.id, requestedLimit: 6000 }));
  check("…as a pending request", /Krishna Das/.test(app.text), app.text);
  await ok("Krishna approves $4,000", act("krishna-das", "decide-approval", { approvalId: (await approvalFor(String(app.json.id)))?.id, decision: "approved", amount: 4000 }));
  check("the limit is $4,000", Number((await row("accounts.json", String(big.json.id)))?.creditLimit) === 4000);
}

async function guards() {
  console.log("\n— generic API guards");
  await ok("PATCH status on an order answers", call("user", "PATCH", "/api/records/orders/order-19", { values: { status: "delivered" } }));
  check("…but the status is unchanged", (await row("orders.json", "order-19"))?.status === "open");
  await ok("PATCH discountPercent on an opportunity answers", call("user", "PATCH", "/api/records/opportunities/opp-harbor-diner", { values: { discountPercent: 5 } }));
  check("…but the discount is unchanged", (await row("opportunities.json", "opp-harbor-diner"))?.discountPercent === 20);
  await refused("DELETE on an approval is refused", "cannot be deleted", () => call("user", "DELETE", "/api/records/approvals/approval-1"));
  await refused("DELETE on a credit memo is refused", "cannot be deleted", () => call("user", "DELETE", "/api/records/credit-memos/cm-1"));
}

const backup = await mkdtemp(path.join(os.tmpdir(), "fieldnote-records-"));
await cp(recordsDirectory, path.join(backup, "records"), { recursive: true });
await cp(path.join(dataDirectory, "rules.json"), path.join(backup, "rules.json"));
try {
  const ping = await fetch(`${base}/login`).catch(() => undefined);
  if (!ping?.ok) throw new Error(`Fieldnote is not answering at ${base}. Start it with: cd apps/fieldnote && npm run dev`);
  await guards();
  await workflow1();
  await workflow2();
  await workflow3();
  await workflow4();
  await workflow5();
} finally {
  await rm(recordsDirectory, { recursive: true, force: true });
  await cp(path.join(backup, "records"), recordsDirectory, { recursive: true });
  await cp(path.join(backup, "rules.json"), path.join(dataDirectory, "rules.json"));
  await rm(backup, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failures.length} failed. Records restored.`);
  if (failures.length) {
    console.log(failures.map((line) => `  FAIL ${line}`).join("\n"));
    process.exitCode = 1;
  }
}
