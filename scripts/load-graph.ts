import { readdir } from "node:fs/promises";
import path from "node:path";
import { authoredDocsDirectory } from "./paths.ts";
import { openSession, runWrite } from "./graph-session.ts";
import { readData, readRecords } from "./read-records.ts";

type Row = Record<string, string | number | null>;

const { session, close } = openSession();

try {
  await runWrite(session, "MATCH (n) DETACH DELETE n");

  const rules = await readData<{
    discountCapPercent: number;
    sendQuote: string;
    creditApprovalOverDollars: number;
    paymentPlanApprovalOverDollars: number;
    paymentPlanMaxInstallmentsWithoutApproval: number;
    purchaseOrderApprovalOverDollars: number;
    autoCreditLimitDollars: number;
    holdAfterDaysPastDue: number;
    quoteValidDays: number;
    financeApproverId: string;
    deliveryDays: Record<string, string>;
    warehouseFamilies: Record<string, string>;
  }>("rules.json");
  const ui = await readData<{
    modules: string[];
    controls: { id: string; name: string; module: string; where: string }[];
  }>("ui.json");
  const offices = await readRecords<Row[]>("offices.json");
  const warehouses = await readRecords<Row[]>("warehouses.json");
  const territories = await readRecords<Row[]>("territories.json");
  const employees = await readRecords<Row[]>("employees.json");
  const accounts = await readRecords<Row[]>("accounts.json");
  const contacts = await readRecords<Row[]>("contacts.json");
  const suppliers = await readRecords<Row[]>("suppliers.json");
  const products = await readRecords<Row[]>("products.json");
  const opportunities = await readRecords<Row[]>("opportunities.json");
  const quotes = await readRecords<Row[]>("quotes.json");
  const orders = await readRecords<Row[]>("orders.json");
  const invoices = await readRecords<Row[]>("invoices.json");
  const shipments = await readRecords<Row[]>("shipments.json");
  const inventory = await readRecords<Row[]>("inventory.json");
  const purchaseOrders = await readRecords<Row[]>("purchase-orders.json");
  const cases = await readRecords<Row[]>("cases.json");
  const approvals = await readRecords<Row[]>("approvals.json");
  const orderLines = await readRecords<Row[]>("order-lines.json");
  const shipmentLines = await readRecords<Row[]>("shipment-lines.json");
  const quoteLines = await readRecords<Row[]>("quote-lines.json");
  const purchaseOrderLines = await readRecords<Row[]>("purchase-order-lines.json");
  const lineItems = await readRecords<Row[]>("line-items.json");
  const creditMemos = await readRecords<Row[]>("credit-memos.json");
  const payments = await readRecords<Row[]>("payments.json");
  const paymentPlans = await readRecords<Row[]>("payment-plans.json");
  const creditApplications = await readRecords<Row[]>("credit-applications.json");
  const priceBooks = await readRecords<Row[]>("price-books.json");
  const priceBookEntries = await readRecords<Row[]>("price-book-entries.json");

  const graphOpportunities = opportunities.map((opportunity) => {
    const { discountPercent: _discountPercent, ...identity } = opportunity;
    return identity;
  });

  await runWrite(session, `CREATE (:Company {id: "fieldnote", name: "Fieldnote"})`);
  await runWrite(
    session,
    `UNWIND $rows AS row
     CREATE (:Office {id: row.id, name: row.name, city: row.city})
     WITH row
     MATCH (company:Company {id: "fieldnote"}), (office:Office {id: row.id})
     CREATE (company)-[:HAS_OFFICE]->(office)`,
    { rows: offices },
  );
  await runWrite(
    session,
    `UNWIND $rows AS row
     CREATE (:Warehouse {id: row.id, name: row.name, kind: row.kind})
     WITH row
     MATCH (warehouse:Warehouse {id: row.id}), (office:Office {id: row.officeId})
     CREATE (office)-[:HAS_WAREHOUSE]->(warehouse)`,
    { rows: warehouses },
  );
  await runWrite(
    session,
    `UNWIND $rows AS row
     CREATE (:Territory {id: row.id, name: row.name})
     WITH row
     MATCH (territory:Territory {id: row.id}), (office:Office {id: row.officeId})
     CREATE (territory)-[:BASED_AT]->(office)`,
    { rows: territories },
  );
  await runWrite(
    session,
    `UNWIND $rows AS row
     CREATE (:Person {id: row.id, name: row.name, roleName: row.role, department: row.department})`,
    { rows: employees },
  );
  await runWrite(
    session,
    `UNWIND $rows AS row
     MATCH (person:Person {id: row.id}), (manager:Person {id: row.reportsTo})
     CREATE (person)-[:REPORTS_TO]->(manager)`,
    { rows: employees.filter((employee) => employee.reportsTo) },
  );
  await runWrite(
    session,
    `UNWIND $rows AS row
     MATCH (person:Person {id: row.id}), (territory:Territory {id: row.territoryId})
     CREATE (person)-[:COVERS]->(territory)`,
    { rows: employees.filter((employee) => employee.territoryId) },
  );

  await runWrite(session, `CREATE (:Role {id: "account-executive", name: "account executive"})`);
  await runWrite(session, `CREATE (:Role {id: "manager", name: "manager"})`);
  await runWrite(
    session,
    `MATCH (person:Person {id: "user"}), (role:Role {id: "account-executive"})
     CREATE (person)-[:HAS_ROLE]->(role)`,
  );
  await runWrite(
    session,
    `MATCH (person:Person {id: "alex-morgan"}), (role:Role {id: "manager"})
     CREATE (person)-[:HAS_ROLE]->(role)`,
  );
  await runWrite(session, `CREATE (:Role {id: "senior-account-executive", name: "senior account executive"})`);
  await runWrite(session, `CREATE (:Role {id: "owner", name: "owner"})`);
  await runWrite(
    session,
    `MATCH (person:Person {id: "krishna-das"}), (role:Role {id: "owner"})
     CREATE (person)-[:HAS_ROLE]->(role)`,
  );
  await runWrite(
    session,
    `MATCH (person:Person {id: "shail-shah"}), (role:Role {id: "senior-account-executive"})
     CREATE (person)-[:HAS_ROLE]->(role)`,
  );
  const ruleRows = [
    { id: "discount-cap", action: "discount", scope: `${rules.discountCapPercent} percent`, allow: false },
    { id: "send-quote", action: "send quote", scope: rules.sendQuote, allow: true },
    { id: "credit-approval", action: "issue credit", scope: `over ${rules.creditApprovalOverDollars} dollars needs the approver`, allow: false },
    { id: "payment-plan", action: "payment plan", scope: `over ${rules.paymentPlanApprovalOverDollars} dollars or more than ${rules.paymentPlanMaxInstallmentsWithoutApproval} installments needs finance`, allow: false },
    { id: "purchase-order-approval", action: "purchase order", scope: `over ${rules.purchaseOrderApprovalOverDollars} dollars needs finance`, allow: false },
    { id: "credit-limit", action: "credit limit", scope: `over ${rules.autoCreditLimitDollars} dollars needs finance`, allow: false },
    { id: "credit-hold", action: "credit hold", scope: `an invoice still open ${rules.holdAfterDaysPastDue} days after its due date`, allow: false },
    { id: "quote-validity", action: "accept quote", scope: `${rules.quoteValidDays} days`, allow: true },
    { id: "finance-approver", action: "finance", scope: rules.financeApproverId, allow: true },
    { id: "receive-stock", action: "receive", scope: "account executives do not receive", allow: false },
  ];
  await runWrite(
    session,
    `UNWIND $rows AS row
     CREATE (:Rule {id: row.id, tool: "fieldnote", action: row.action, scope: row.scope, allow: row.allow})`,
    { rows: ruleRows },
  );
  await runWrite(
    session,
    `MATCH (role:Role) WHERE role.id IN ["account-executive", "senior-account-executive"]
     MATCH (rule:Rule) WHERE rule.id IN ["discount-cap", "send-quote", "credit-approval", "payment-plan", "credit-hold", "quote-validity", "receive-stock"]
     CREATE (role)-[:HAS_RULE]->(rule)`,
  );
  await runWrite(
    session,
    `MATCH (role:Role {id: "owner"})
     MATCH (rule:Rule)
     CREATE (role)-[:HAS_RULE]->(rule)`,
  );
  await runWrite(
    session,
    `UNWIND $rows AS row
     MATCH (territory:Territory {id: row.id})
     SET territory.deliveryDays = row.days, territory.zipPrefixes = row.zips`,
    { rows: territories.map((territory) => ({ id: territory.id, days: rules.deliveryDays[String(territory.id)] ?? "", zips: territory.zipPrefixes ?? "" })) },
  );
  await runWrite(
    session,
    `UNWIND $rows AS row
     MATCH (warehouse:Warehouse {id: row.id})
     SET warehouse.families = row.families`,
    { rows: Object.entries(rules.warehouseFamilies).map(([id, families]) => ({ id, families })) },
  );

  await runWrite(
    session,
    `UNWIND $rows AS row
     CREATE (:Account {id: row.id, name: row.name, status: row.status, creditHold: row.creditHold, holdReason: row.holdReason, creditLimit: row.creditLimit, creditStatus: row.creditStatus, priceBookId: row.priceBookId, deliveryDays: row.deliveryDays, paymentTerms: row.paymentTerms})
     WITH row
     MATCH (account:Account {id: row.id})
     MATCH (owner:Person {id: row.ownerId})
     MATCH (territory:Territory {id: row.territoryId})
     MATCH (warehouse:Warehouse {id: row.warehouseId})
     CREATE (owner)-[:OWNS]->(account)
     CREATE (account)-[:IN_TERRITORY]->(territory)
     CREATE (account)-[:SERVED_BY]->(warehouse)`,
    { rows: accounts },
  );
  await runWrite(
    session,
    `UNWIND $rows AS row
     CREATE (:Contact {id: row.id, name: row.name, roleName: row.role})
     WITH row
     MATCH (contact:Contact {id: row.id}), (account:Account {id: row.accountId})
     CREATE (account)-[:HAS_CONTACT]->(contact)`,
    { rows: contacts },
  );
  await runWrite(
    session,
    `UNWIND $rows AS row CREATE (:Supplier {id: row.id, name: row.name, category: row.category, minOrderDollars: row.minOrderDollars, leadDays: row.leadDays})`,
    { rows: suppliers },
  );
  await runWrite(
    session,
    `UNWIND $rows AS row
     CREATE (:Product {id: row.id, name: row.name, sku: row.sku, family: row.family})
     WITH row
     MATCH (product:Product {id: row.id}), (supplier:Supplier {id: row.supplierId})
     CREATE (supplier)-[:SUPPLIES {minOrderDollars: row.minOrder, leadDays: row.leadDays}]->(product)`,
    { rows: products.map((product) => {
      const supplier = suppliers.find((row) => row.id === product.supplierId);
      return { ...product, minOrder: supplier?.minOrderDollars ?? 500, leadDays: supplier?.leadDays ?? 0 };
    }) },
  );
  const reserved = new Map<string, number>();
  const orderById = new Map(orders.map((row) => [String(row.id), row]));
  for (const line of orderLines) {
    const order = orderById.get(String(line.orderId));
    if (!order || !["open", "backordered", "picking"].includes(String(order.status))) continue;
    const key = `${line.productId}|${line.warehouseId || order.warehouseId}`;
    reserved.set(key, (reserved.get(key) ?? 0) + Number(line.allocated ?? 0));
  }
  const shipmentById = new Map(shipments.map((row) => [String(row.id), row]));
  for (const line of shipmentLines) {
    const shipment = shipmentById.get(String(line.shipmentId));
    if (shipment?.status !== "scheduled") continue;
    const key = `${line.productId}|${shipment.warehouseId}`;
    reserved.set(key, (reserved.get(key) ?? 0) + Number(line.quantity ?? 0));
  }
  await runWrite(
    session,
    `UNWIND $rows AS row
     MATCH (product:Product {id: row.productId}), (warehouse:Warehouse {id: row.warehouseId})
     CREATE (product)-[:STOCKED_AT {onHand: row.onHand, reorderPoint: row.reorderPoint, reorderQty: row.reorderQty, reserved: row.reserved, free: row.free}]->(warehouse)`,
    { rows: inventory.map((row) => {
      const held = reserved.get(`${row.productId}|${row.warehouseId}`) ?? 0;
      return { ...row, reorderPoint: row.reorderPoint ?? 0, reorderQty: row.reorderQty ?? 0, reserved: held, free: Math.max(0, Number(row.onHand) - held) };
    }) },
  );
  await runWrite(
    session,
    `UNWIND $rows AS row
     CREATE (:Opportunity {id: row.id, name: row.name, stage: row.stage, amount: row.amount})
     WITH row
     MATCH (opportunity:Opportunity {id: row.id})
     MATCH (account:Account {id: row.accountId})
     MATCH (owner:Person {id: row.ownerId})
     CREATE (owner)-[:OWNS]->(opportunity)
     CREATE (opportunity)-[:FOR]->(account)`,
    { rows: graphOpportunities },
  );

  function withoutDiscount(row: Row) {
    return Object.fromEntries(Object.entries(row).filter(([key]) => !/discount/i.test(key)));
  }

  async function linkIdentity(label: string, rows: Row[], links: string) {
    if (rows.length === 0) return;
    await runWrite(session, `UNWIND $rows AS row CREATE (n:${label} {id: row.id}) SET n += row ${links}`, { rows: rows.map(withoutDiscount) });
  }

  await linkIdentity(
    "Quote",
    quotes,
    `WITH n, row MATCH (account:Account {id: row.accountId}) CREATE (n)-[:FOR]->(account)`,
  );
  await linkIdentity(
    "Order",
    orders,
    `WITH n, row MATCH (account:Account {id: row.accountId}) CREATE (n)-[:FOR]->(account)`,
  );
  await linkIdentity(
    "Invoice",
    invoices,
    `WITH n, row MATCH (account:Account {id: row.accountId}) CREATE (n)-[:FOR]->(account)`,
  );
  await linkIdentity(
    "Shipment",
    shipments,
    `WITH n, row MATCH (account:Account {id: row.accountId}) CREATE (n)-[:FOR]->(account)`,
  );
  await linkIdentity(
    "PurchaseOrder",
    purchaseOrders,
    `WITH n, row MATCH (supplier:Supplier {id: row.supplierId}) CREATE (n)-[:FROM]->(supplier)`,
  );
  await linkIdentity(
    "Case",
    cases,
    `WITH n, row MATCH (account:Account {id: row.accountId}) CREATE (n)-[:FOR]->(account)`,
  );
  await linkIdentity("Approval", approvals, "");
  await linkIdentity("CreditMemo", creditMemos, "");
  await linkIdentity("Payment", payments, "");
  await linkIdentity("PaymentPlan", paymentPlans, "");
  await linkIdentity("CreditApplication", creditApplications, "");
  await linkIdentity("PriceBook", priceBooks, "");

  async function connect(query: string) {
    await runWrite(session, query);
  }
  await connect(`MATCH (quote:Quote) WHERE quote.opportunityId <> ""
    MATCH (deal:Opportunity {id: quote.opportunityId}) CREATE (quote)-[:QUOTES]->(deal)`);
  await connect(`MATCH (order:Order) WHERE order.quoteId <> ""
    MATCH (quote:Quote {id: order.quoteId}) CREATE (order)-[:FROM_QUOTE]->(quote)`);
  await connect(`MATCH (invoice:Invoice) WHERE invoice.orderId <> ""
    MATCH (order:Order {id: invoice.orderId}) CREATE (invoice)-[:BILLS]->(order)`);
  await connect(`MATCH (shipment:Shipment) WHERE shipment.orderId <> ""
    MATCH (order:Order {id: shipment.orderId}) CREATE (shipment)-[:SHIPS]->(order)`);
  await connect(`MATCH (supportCase:Case) WHERE supportCase.shipmentId <> ""
    MATCH (shipment:Shipment {id: supportCase.shipmentId}) CREATE (supportCase)-[:ABOUT]->(shipment)`);
  await connect(`MATCH (supportCase:Case) WHERE supportCase.orderId <> ""
    MATCH (order:Order {id: supportCase.orderId}) CREATE (supportCase)-[:ABOUT]->(order)`);
  await connect(`MATCH (supportCase:Case) WHERE supportCase.invoiceId <> ""
    MATCH (invoice:Invoice {id: supportCase.invoiceId}) CREATE (supportCase)-[:ABOUT]->(invoice)`);
  await connect(`MATCH (approval:Approval) WHERE approval.subjectId <> "" AND approval.subjectType = "opportunity"
    MATCH (deal:Opportunity {id: approval.subjectId}) CREATE (approval)-[:DECIDES]->(deal)`);
  if (orderLines.length > 0) {
    await runWrite(session, `UNWIND $rows AS row
      MATCH (order:Order {id: row.orderId}), (product:Product {id: row.productId})
      CREATE (line:OrderLine {id: row.id, quantity: row.quantity, unitPrice: row.unitPrice, allocated: row.allocated, backordered: row.backordered})
      CREATE (order)-[:HAS_LINE]->(line)-[:OF]->(product)`, { rows: orderLines });
  }
  if (shipmentLines.length > 0) {
    await runWrite(session, `UNWIND $rows AS row
      MATCH (shipment:Shipment {id: row.shipmentId}), (product:Product {id: row.productId})
      CREATE (line:ShipmentLine {id: row.id, quantity: row.quantity, short: row.short, redelivered: row.redelivered, credited: row.credited})
      CREATE (shipment)-[:HAS_LINE]->(line)-[:OF]->(product)`, { rows: shipmentLines });
  }
  if (quoteLines.length > 0) {
    await runWrite(session, `UNWIND $rows AS row
      MATCH (quote:Quote {id: row.quoteId}), (product:Product {id: row.productId})
      CREATE (line:QuoteLine {id: row.id, quantity: row.quantity, unitPrice: row.unitPrice})
      CREATE (quote)-[:HAS_LINE]->(line)-[:OF]->(product)`, { rows: quoteLines });
  }
  if (lineItems.length > 0) {
    await runWrite(session, `UNWIND $rows AS row
      MATCH (deal:Opportunity {id: row.opportunityId}), (product:Product {id: row.productId})
      CREATE (line:DealLine {id: row.id, quantity: row.quantity, unitPrice: row.unitPrice})
      CREATE (deal)-[:HAS_LINE]->(line)-[:OF]->(product)`, { rows: lineItems.map(withoutDiscount) });
  }
  if (purchaseOrderLines.length > 0) {
    await runWrite(session, `UNWIND $rows AS row
      MATCH (po:PurchaseOrder {id: row.poId}), (product:Product {id: row.productId})
      CREATE (line:PurchaseOrderLine {id: row.id, quantity: row.quantity, unitCost: row.unitCost, received: row.received})
      CREATE (po)-[:HAS_LINE]->(line)-[:OF]->(product)`, { rows: purchaseOrderLines });
  }
  if (priceBookEntries.length > 0) {
    await runWrite(session, `UNWIND $rows AS row
      MATCH (book:PriceBook {id: row.priceBookId}), (product:Product {id: row.productId})
      CREATE (book)-[:PRICES {price: row.price}]->(product)`, { rows: priceBookEntries });
  }

  await runWrite(session, `CREATE (:App {id: "fieldnote-crm", name: "Fieldnote CRM"})`);
  await runWrite(
    session,
    `UNWIND $names AS name
     CREATE (:Module {id: name, name: name})
     WITH name
     MATCH (app:App {id: "fieldnote-crm"}), (module:Module {id: name})
     CREATE (app)-[:HAS_MODULE]->(module)`,
    { names: ui.modules },
  );
  await runWrite(
    session,
    `UNWIND $rows AS row
     CREATE (:Control {id: row.id, name: row.name, module: row.module, where: row.where})
     WITH row
     MATCH (control:Control {id: row.id}), (module:Module {name: row.module})
     CREATE (control)-[:ON]->(module)`,
    { rows: ui.controls },
  );
  await runWrite(
    session,
    `MATCH (send:Control {id: "send-quote"}), (rule:Rule {id: "send-quote"})
     CREATE (send)-[:GOVERNED_BY]->(rule)
     WITH 1 AS _
     MATCH (discount:Control {id: "discount"}), (cap:Rule {id: "discount-cap"})
     CREATE (discount)-[:GOVERNED_BY]->(cap)
     WITH 1 AS _
     MATCH (credit:Control {id: "issue-credit"}), (creditRule:Rule {id: "credit-approval"})
     CREATE (credit)-[:GOVERNED_BY]->(creditRule)
     WITH 1 AS _
     MATCH (plan:Control {id: "propose-plan"}), (planRule:Rule {id: "payment-plan"})
     CREATE (plan)-[:GOVERNED_BY]->(planRule)
     WITH 1 AS _
     MATCH (po:Control {id: "submit-po"}), (poRule:Rule {id: "purchase-order-approval"})
     CREATE (po)-[:GOVERNED_BY]->(poRule)
     WITH 1 AS _
     MATCH (receive:Control {id: "receive-po"}), (receiveRule:Rule {id: "receive-stock"})
     CREATE (receive)-[:GOVERNED_BY]->(receiveRule)
     WITH 1 AS _
     MATCH (hold:Control {id: "release-hold"}), (holdRule:Rule {id: "credit-hold"})
     CREATE (hold)-[:GOVERNED_BY]->(holdRule)
     WITH 1 AS _
     MATCH (limit:Control {id: "apply-credit"}), (limitRule:Rule {id: "credit-limit"})
     CREATE (limit)-[:GOVERNED_BY]->(limitRule)`,
  );

  const authoredNames = (await readdir(authoredDocsDirectory)).filter((name) => name.endsWith(".md"));
  const authoredRows = authoredNames.map((fileName) => ({
    id: fileName.replace(/\.md$/, ""),
    title: fileName.replace(/\.md$/, "").replace(/-/g, " "),
    source: path.posix.join("data/docs/authored", fileName),
    governs: ["discount-policy.md", "sending-a-quote.md", "approval-matrix.md", "credit-holds.md", "credit-memos.md", "payment-plans.md", "who-decides.md", "onboarding-checklist.md", "reorder-and-receiving.md"].includes(fileName),
  }));
  await runWrite(
    session,
    `UNWIND $rows AS row
     CREATE (:Document {id: row.id, title: row.title, source: row.source, kind: "authored"})
     WITH row
     MATCH (document:Document {id: row.id})
     MATCH (app:App {id: "fieldnote-crm"})
     FOREACH (_ IN CASE WHEN row.governs THEN [1] ELSE [] END | CREATE (document)-[:GOVERNS]->(app))
     FOREACH (_ IN CASE WHEN row.governs THEN [] ELSE [1] END | CREATE (document)-[:DESCRIBES]->(app))`,
    { rows: authoredRows },
  );

  const discountCount = await session.run(
    "MATCH (n) WHERE n.discountPercent IS NOT NULL OR n.discount IS NOT NULL RETURN count(n) AS count",
  );
  const discountNodes = discountCount.records[0].get("count").toNumber();
  if (discountNodes !== 0) {
    throw new Error("A graph node stored the discount");
  }
  const nodeCount = await session.run("MATCH (n) RETURN count(n) AS count");
  console.log(`graph nodes ${nodeCount.records[0].get("count").toNumber()}`);
} finally {
  await close();
}
