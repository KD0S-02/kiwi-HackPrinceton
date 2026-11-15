import { readFileSync } from "node:fs";
import path from "node:path";
import { dataDirectory, recordsDirectory } from "./paths.ts";

type Row = Record<string, unknown>;

type Slice = {
  account?: Row;
  deals: Row[];
  quotes: Row[];
  orders: Row[];
  shipments: Row[];
  cases: Row[];
  credits: Row[];
  approvals: Row[];
  lines: Row[];
  stock: Row[];
  rules: { action: string; scope: string; allow: boolean; controls: string[] }[];
};

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

function readRecords(name: string) {
  return readJson<Row[]>(path.join(recordsDirectory, name));
}

function text(value: unknown) {
  if (value == null || value === "") return "";
  if (typeof value === "object" && value && "toNumber" in value) return String((value as { toNumber: () => number }).toNumber());
  return String(value);
}

function namedAccount(question: string) {
  const asked = question.toLowerCase();
  return readRecords("accounts.json")
    .filter((account) => asked.includes(text(account.name).toLowerCase()))
    .sort((a, b) => text(b.name).length - text(a.name).length)[0];
}

function rulesFromFile(): Slice["rules"] {
  const rules = readJson<Record<string, unknown>>(path.join(dataDirectory, "rules.json"));
  return [
    { action: "discount", scope: `${rules.discountCapPercent} percent`, allow: false, controls: ["discount"] },
    { action: "send quote", scope: text(rules.sendQuote), allow: true, controls: ["send-quote"] },
    { action: "issue credit", scope: `over ${rules.creditApprovalOverDollars} dollars needs the approver`, allow: false, controls: ["issue-credit"] },
    { action: "payment plan", scope: `over ${rules.paymentPlanApprovalOverDollars} dollars or more than ${rules.paymentPlanMaxInstallmentsWithoutApproval} installments needs finance`, allow: false, controls: ["propose-plan"] },
    { action: "purchase order", scope: `over ${rules.purchaseOrderApprovalOverDollars} dollars needs finance`, allow: false, controls: ["submit-po"] },
    { action: "credit limit", scope: `over ${rules.autoCreditLimitDollars} dollars needs finance`, allow: false, controls: ["apply-credit"] },
    { action: "credit hold", scope: `an invoice still open ${rules.holdAfterDaysPastDue} days after its due date`, allow: false, controls: ["release-hold"] },
    { action: "receive", scope: "account executives do not receive", allow: false, controls: ["receive-po"] },
  ];
}

function reservedStock() {
  const orders = new Map(readRecords("orders.json").map((row) => [text(row.id), row]));
  const reserved = new Map<string, number>();
  for (const line of readRecords("order-lines.json")) {
    const order = orders.get(text(line.orderId));
    if (!order || !["open", "backordered", "picking"].includes(text(order.status))) continue;
    const key = `${text(line.productId)}|${text(line.warehouseId || order.warehouseId)}`;
    reserved.set(key, (reserved.get(key) ?? 0) + Number(line.allocated ?? 0));
  }
  const shipments = new Map(readRecords("shipments.json").map((row) => [text(row.id), row]));
  for (const line of readRecords("shipment-lines.json")) {
    const shipment = shipments.get(text(line.shipmentId));
    if (text(shipment?.status) !== "scheduled") continue;
    const key = `${text(line.productId)}|${text(shipment?.warehouseId)}`;
    reserved.set(key, (reserved.get(key) ?? 0) + Number(line.quantity ?? 0));
  }
  return reserved;
}

// Lines on the shipments a case points at, priced from the order line, plus free stock at the office's warehouses.
function factsFromFiles(accountId: string) {
  const account = readRecords("accounts.json").find((row) => row.id === accountId);
  const cases = readRecords("cases.json").filter((row) => row.accountId === accountId && row.shipmentId);
  const shipmentIds = new Set(cases.map((row) => row.shipmentId));
  if (!account || shipmentIds.size === 0) return { lines: [] as Row[], stock: [] as Row[] };
  const territory = readRecords("territories.json").find((row) => row.id === account.territoryId);
  const warehouses = readRecords("warehouses.json").filter((row) => row.officeId === territory?.officeId);
  const products = new Map(readRecords("products.json").map((row) => [text(row.id), row]));
  const shipments = new Map(readRecords("shipments.json").filter((row) => shipmentIds.has(row.id)).map((row) => [text(row.id), row]));
  const orderLines = readRecords("order-lines.json");
  const lines = readRecords("shipment-lines.json").filter((row) => shipmentIds.has(row.shipmentId)).map((line) => {
    const shipment = shipments.get(text(line.shipmentId));
    const product = products.get(text(line.productId));
    const orderLine = orderLines.find((row) => row.orderId === shipment?.orderId && row.productId === line.productId);
    return {
      id: line.id,
      shipmentId: line.shipmentId,
      orderId: shipment?.orderId ?? "",
      productId: line.productId,
      product: text(product?.name || line.productId),
      quantity: line.quantity,
      short: line.short,
      redelivered: line.redelivered,
      credited: line.credited,
      unitPrice: orderLine?.unitPrice ?? product?.price ?? "",
    };
  });
  const reserved = reservedStock();
  const inventory = readRecords("inventory.json");
  const stock: Row[] = [];
  for (const productId of new Set(lines.map((line) => line.productId))) {
    for (const warehouse of warehouses) {
      const row = inventory.find((item) => item.productId === productId && item.warehouseId === warehouse.id);
      const held = reserved.get(`${text(productId)}|${text(warehouse.id)}`) ?? 0;
      if (!row && held === 0) continue;
      const onHand = Number(row?.onHand ?? 0);
      stock.push({
        id: `${text(productId)}|${text(warehouse.id)}`,
        product: text(products.get(text(productId))?.name || productId),
        warehouse: text(warehouse.name),
        onHand,
        reserved: held,
        free: Math.max(0, onHand - held),
      });
    }
  }
  return { lines, stock };
}

function withInvoice(cases: Row[]) {
  const invoices = new Map(readRecords("invoices.json").map((row) => [text(row.id), row]));
  return cases.map((row) => {
    const invoice = invoices.get(text(row.invoiceId));
    return invoice ? { ...row, invoiceAmount: invoice.amount, invoicePaid: invoice.paid, invoiceCredited: invoice.credited } : row;
  });
}

function sliceFromFiles(accountId: string): Slice {
  const account = readRecords("accounts.json").find((row) => row.id === accountId);
  const deals = readRecords("opportunities.json").filter((row) => row.accountId === accountId);
  const dealIds = new Set(deals.map((row) => row.id));
  const quotes = readRecords("quotes.json").filter((row) => row.accountId === accountId || dealIds.has(row.opportunityId));
  const orders = readRecords("orders.json").filter((row) => row.accountId === accountId);
  const orderIds = new Set(orders.map((row) => row.id));
  const shipments = readRecords("shipments.json").filter((row) => row.accountId === accountId || orderIds.has(row.orderId));
  const cases = withInvoice(readRecords("cases.json").filter((row) => row.accountId === accountId));
  const credits = readRecords("credit-memos.json").filter((row) => row.accountId === accountId);
  const approvals = readRecords("approvals.json").filter((row) => row.accountId === accountId || dealIds.has(row.opportunityId) || dealIds.has(row.subjectId));
  const facts = factsFromFiles(accountId);
  return { account, deals, quotes, orders, shipments, cases, credits, approvals, ...facts, rules: rulesFromFile() };
}

function node(record: { get: (key: string) => { properties?: Row } | null }, key: string): Row | undefined {
  const value = record.get(key);
  return value?.properties;
}

async function sliceFromGraph(accountId: string): Promise<Slice | undefined> {
  const { openSession } = await import("./graph-session.ts");
  const { session, close } = openSession();
  try {
    const accountResult = await session.run(
      `MATCH (account:Account {id: $id})
       OPTIONAL MATCH (owner:Person)-[:OWNS]->(account)
       OPTIONAL MATCH (account)-[:IN_TERRITORY]->(territory)
       OPTIONAL MATCH (account)-[:SERVED_BY]->(warehouse)
       RETURN account, owner, territory, warehouse`,
      { id: accountId },
    );
    const found = accountResult.records[0];
    if (!found?.get("account")) return undefined;
    const account = { ...node(found, "account"), ownerId: text(node(found, "owner")?.id), territoryId: text(node(found, "territory")?.id), warehouseId: text(node(found, "warehouse")?.id) };
    const deals = (await session.run(
      `MATCH (deal:Opportunity)-[:FOR]->(:Account {id: $id})
       OPTIONAL MATCH (owner:Person)-[:OWNS]->(deal)
       RETURN deal, owner`,
      { id: accountId },
    )).records.map((record) => ({ ...node(record, "deal"), ownerId: text(node(record, "owner")?.id) }));
    const quotes = (await session.run(
      `MATCH (quote:Quote)-[:FOR]->(:Account {id: $id})
       OPTIONAL MATCH (quote)-[:QUOTES]->(deal:Opportunity)
       RETURN quote, deal`,
      { id: accountId },
    )).records.map((record) => ({ ...node(record, "quote"), opportunityId: text(node(record, "deal")?.id || node(record, "quote")?.opportunityId) }));
    const orders = (await session.run(
      `MATCH (order:Order)-[:FOR]->(:Account {id: $id})
       OPTIONAL MATCH (order)-[:FROM_QUOTE]->(quote:Quote)
       RETURN order, quote`,
      { id: accountId },
    )).records.map((record) => ({ ...node(record, "order"), quoteId: text(node(record, "quote")?.id || node(record, "order")?.quoteId) }));
    const shipments = (await session.run(
      `MATCH (shipment:Shipment)-[:FOR]->(:Account {id: $id})
       OPTIONAL MATCH (shipment)-[:SHIPS]->(order:Order)
       RETURN shipment, order`,
      { id: accountId },
    )).records.map((record) => ({ ...node(record, "shipment"), orderId: text(node(record, "order")?.id || node(record, "shipment")?.orderId) }));
    const cases = (await session.run(
      `MATCH (supportCase:Case)-[:FOR]->(:Account {id: $id})
       OPTIONAL MATCH (supportCase)-[:ABOUT]->(thing)
       RETURN supportCase, thing`,
      { id: accountId },
    )).records.map((record) => ({ ...node(record, "supportCase"), about: text(node(record, "thing")?.id) }));
    const credits = (await session.run(
      `MATCH (credit:CreditMemo)
       WHERE credit.accountId = $id OR (credit)-[:FOR]->(:Account {id: $id})
       RETURN DISTINCT credit`,
      { id: accountId },
    )).records.map((record) => node(record, "credit") ?? {});
    const approvals = (await session.run(
      `MATCH (approval:Approval)
       WHERE approval.accountId = $id OR (approval)-[:FOR]->(:Account {id: $id}) OR (approval)-[:DECIDES]->(:Opportunity)-[:FOR]->(:Account {id: $id})
       RETURN DISTINCT approval`,
      { id: accountId },
    )).records.map((record) => node(record, "approval") ?? {});
    const rules = (await session.run(
      `MATCH (rule:Rule)
       OPTIONAL MATCH (control:Control)-[:GOVERNED_BY]->(rule)
       RETURN rule, collect(DISTINCT control.id) AS controls`,
    )).records.map((record) => {
      const rule = node(record, "rule") ?? {};
      return { action: text(rule.action), scope: text(rule.scope), allow: Boolean(rule.allow), controls: (record.get("controls") as string[]).filter(Boolean) };
    });
    const lines = (await session.run(
      `MATCH (supportCase:Case)-[:FOR]->(:Account {id: $id})-[:IN_TERRITORY]->(:Territory)
       MATCH (supportCase)-[:ABOUT]->(shipment:Shipment)-[:HAS_LINE]->(line:ShipmentLine)-[:OF]->(product:Product)
       OPTIONAL MATCH (shipment)-[:SHIPS]->(order:Order)-[:HAS_LINE]->(orderLine:OrderLine)-[:OF]->(product)
       RETURN line, product, shipment, order, orderLine`,
      { id: accountId },
    )).records.map((record) => ({
      id: text(node(record, "line")?.id),
      shipmentId: text(node(record, "shipment")?.id),
      orderId: text(node(record, "order")?.id || node(record, "shipment")?.orderId),
      product: text(node(record, "product")?.name || node(record, "line")?.productId),
      quantity: node(record, "line")?.quantity,
      short: node(record, "line")?.short,
      redelivered: node(record, "line")?.redelivered,
      credited: node(record, "line")?.credited,
      unitPrice: node(record, "orderLine")?.unitPrice ?? "",
    }));
    const stock = (await session.run(
      `MATCH (:Account {id: $id})-[:IN_TERRITORY]->(:Territory)-[:BASED_AT]->(:Office)-[:HAS_WAREHOUSE]->(warehouse:Warehouse)
       MATCH (supportCase:Case)-[:FOR]->(:Account {id: $id})
       MATCH (supportCase)-[:ABOUT]->(:Shipment)-[:HAS_LINE]->(:ShipmentLine)-[:OF]->(product:Product)-[stock:STOCKED_AT]->(warehouse)
       RETURN DISTINCT product, warehouse, stock`,
      { id: accountId },
    )).records.map((record) => {
      const edge = record.get("stock")?.properties ?? {};
      return {
        id: `${text(node(record, "product")?.id)}|${text(node(record, "warehouse")?.id)}`,
        product: text(node(record, "product")?.name),
        warehouse: text(node(record, "warehouse")?.name),
        onHand: edge.onHand,
        reserved: edge.reserved,
        free: edge.free,
      };
    });
    return { account, deals, quotes, orders, shipments, cases: withInvoice(cases), credits, approvals, lines, stock, rules: rules.length ? rules : rulesFromFile() };
  } finally {
    await close();
  }
}

function list(rows: Row[], line: (row: Row) => string) {
  const shown = rows.filter((row) => row.id).slice(0, 6);
  return shown.length ? shown.map(line).join("; ") : "none";
}

function pathFor(question: string, slice: Slice) {
  const lines: string[] = [];
  if (/\b(account|restaurant|opportunit|deal)\b/i.test(question) && /\b(create|new|then|start|open)\b/i.test(question)) {
    lines.push(slice.account
      ? `Next: ${text(slice.account.name)} already exists (${text(slice.account.status) || "no status"}). A new opportunity on it is owned by ${text(slice.account.ownerId) || "the account owner"}, starts at Qualify, and its amount is a forecast, not the quote.`
      : "Next: create the restaurant on /accounts first. ZIP is required. It stays in onboarding until Activate. Then open a new opportunity on that account.");
  }
  if (/\b(case|credit|short|deliver|redeliver|invoice)\b/i.test(question)) {
    lines.push("Next: a delivery case follows its shipment or order. A short is reported on the shipment, then a redelivery or a credit. The case closes only after one of those. A credit over the rule is an approval, not a post.");
  }
  return lines;
}

function render(question: string, slice: Slice) {
  const account = slice.account;
  const lines = [
    account
      ? `${text(account.name)} (${text(account.id)}): ${text(account.status) || "status unknown"}, credit hold ${text(account.creditHold) || "no"}${account.holdReason ? ` (${text(account.holdReason)})` : ""}, owner ${text(account.ownerId) || "unknown"}, territory ${text(account.territoryId) || "unknown"}, warehouse ${text(account.warehouseId) || "unknown"}, delivery ${text(account.deliveryDays) || "unset"}.`
      : "No matching restaurant in the graph yet.",
    `Deals: ${list(slice.deals, (row) => `${text(row.id)} ${text(row.stage)} forecast ${text(row.amount)} owner ${text(row.ownerId)}`)}`,
    `Quotes: ${list(slice.quotes, (row) => `${text(row.id)} ${text(row.status)} v${text(row.version) || "1"} quotes ${text(row.opportunityId) || "no deal"}`)}`,
    `Orders: ${list(slice.orders, (row) => `${text(row.id)} ${text(row.status)} from ${text(row.quoteId) || "no quote"}`)}`,
    `Shipments: ${list(slice.shipments, (row) => `${text(row.id)} ${text(row.status)} ships ${text(row.orderId) || "no order"}`)}`,
    `Cases: ${list(slice.cases, (row) => {
      const links = [row.shipmentId && `shipment ${text(row.shipmentId)}`, row.orderId && `order ${text(row.orderId)}`, row.invoiceId && `invoice ${text(row.invoiceId)}`].filter(Boolean).join(", ");
      const balance = text(row.invoiceAmount) ? `, invoice ${text(row.invoiceAmount)} paid ${text(row.invoicePaid) || "0"} credited ${text(row.invoiceCredited) || "0"}` : "";
      return `${text(row.id)} ${text(row.kind)} ${text(row.status)}${row.subject ? ` "${text(row.subject)}"` : ""}${links ? ` (${links})` : ""}${balance}`;
    })}`,
    `Lines: ${list(slice.lines, (row) => `${text(row.product)} qty ${text(row.quantity)} short ${text(row.short) || "0"} redelivered ${text(row.redelivered) || "0"} credited ${text(row.credited) || "0"} at ${text(row.unitPrice)} on ${text(row.shipmentId)}`)}`,
    `Stock: ${list(slice.stock, (row) => `${text(row.product)} ${text(row.free)} free (${text(row.onHand)} on hand, ${text(row.reserved) || "0"} reserved) at ${text(row.warehouse)}`)}`,
    `Credits: ${list(slice.credits, (row) => `${text(row.id)} ${text(row.status)} ${text(row.amount)}`)}`,
    `Approvals: ${list(slice.approvals, (row) => `${text(row.id)} ${text(row.kind)} ${text(row.status)} decides ${text(row.subjectId || row.opportunityId) || "nothing"}`)}`,
    `Rules: ${slice.rules.map((rule) => `${rule.action} (${rule.scope})${rule.controls.length ? ` governs ${rule.controls.join(", ")}` : ""}`).join("; ")}`,
    ...pathFor(question, slice),
  ];
  return lines.join("\n");
}

// The connected records for a question, from the company graph, then the CRM files if the graph is unavailable.
export async function lookupWork(question: string) {
  const account = namedAccount(question);
  const accountId = text(account?.id);
  if (!accountId) {
    const rules = rulesFromFile();
    return [`No restaurant named in the question.`, `Rules: ${rules.map((rule) => `${rule.action} (${rule.scope}) governs ${rule.controls.join(", ")}`).join("; ")}`, ...pathFor(question, { deals: [], quotes: [], orders: [], shipments: [], cases: [], credits: [], approvals: [], lines: [], stock: [], rules })].join("\n");
  }
  const files = sliceFromFiles(accountId);
  try {
    const slice = await sliceFromGraph(accountId);
    if (slice?.account) {
      const prefer = (graphRows: Row[], fileRows: Row[]) => graphRows.filter((row) => row.id).length ? graphRows : fileRows;
      return render(question, {
        account: { ...files.account, ...slice.account },
        deals: prefer(slice.deals, files.deals),
        quotes: prefer(slice.quotes, files.quotes),
        orders: prefer(slice.orders, files.orders),
        shipments: prefer(slice.shipments, files.shipments),
        cases: prefer(slice.cases, files.cases),
        credits: prefer(slice.credits, files.credits),
        approvals: prefer(slice.approvals, files.approvals),
        lines: prefer(slice.lines, files.lines),
        stock: prefer(slice.stock, files.stock),
        rules: slice.rules.length >= files.rules.length ? slice.rules : files.rules,
      });
    }
  } catch {
    // The graph is optional. The CRM files carry the same records.
  }
  return render(question, files);
}

const isDirectRun = process.argv[1]?.endsWith("lookup-work.ts");
if (isDirectRun) {
  const question = process.argv.slice(2).join(" ") || "create an account for Harbor Diner and then an opportunity";
  console.log(await lookupWork(question));
}

export function workflowQuestion(question: string) {
  if (/^\s*(where|open|show me where)\b/i.test(question) && !/\b(then|case|credit|short|deliver|onboard|convert|hold)\b/i.test(question)) return false;
  return /\b(create|new|then|onboard|activat|opportunit|deal|case|credit|short|redeliver|deliver|convert|hold|invoice|approval|backorder|purchase order|receiv)\b/i.test(question);
}
