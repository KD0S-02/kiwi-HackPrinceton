import { readdir } from "node:fs/promises";
import path from "node:path";
import { authoredDocsDirectory } from "./paths.ts";
import { openSession, runWrite } from "./graph-session.ts";
import { readData, readRecords } from "./read-records.ts";

type Row = Record<string, string | number | null>;

const { session, close } = openSession();

try {
  await runWrite(session, "MATCH (n) DETACH DELETE n");

  const rules = await readData<{ discountCapPercent: number; sendQuote: string }>("rules.json");
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
  await runWrite(
    session,
    `CREATE (:Rule {id: "discount-cap", tool: "fieldnote", action: "discount", scope: $scope, allow: false})
     CREATE (:Rule {id: "send-quote", tool: "fieldnote", action: "send quote", scope: $sendScope, allow: true})
     WITH 1 AS _
     MATCH (role:Role {id: "account-executive"}), (discount:Rule {id: "discount-cap"}), (send:Rule {id: "send-quote"})
     CREATE (role)-[:HAS_RULE]->(discount)
     CREATE (role)-[:HAS_RULE]->(send)`,
    { scope: `${rules.discountCapPercent} percent`, sendScope: rules.sendQuote },
  );

  await runWrite(
    session,
    `UNWIND $rows AS row
     CREATE (:Account {id: row.id, name: row.name})
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
    `UNWIND $rows AS row CREATE (:Supplier {id: row.id, name: row.name, category: row.category})`,
    { rows: suppliers },
  );
  await runWrite(
    session,
    `UNWIND $rows AS row
     CREATE (:Product {id: row.id, name: row.name, sku: row.sku, family: row.family})
     WITH row
     MATCH (product:Product {id: row.id}), (supplier:Supplier {id: row.supplierId})
     CREATE (supplier)-[:SUPPLIES]->(product)`,
    { rows: products },
  );
  await runWrite(
    session,
    `UNWIND $rows AS row
     MATCH (product:Product {id: row.productId}), (warehouse:Warehouse {id: row.warehouseId})
     CREATE (product)-[:STOCKED_AT]->(warehouse)`,
    { rows: inventory },
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

  async function linkIdentity(label: string, rows: Row[], links: string) {
    await runWrite(session, `UNWIND $rows AS row CREATE (n:${label} {id: row.id}) SET n += row ${links}`, { rows });
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
     MATCH (control:Control {id: row.id}), (module:Module {name: "Opportunities"})
     CREATE (control)-[:ON]->(module)`,
    { rows: ui.controls },
  );
  await runWrite(
    session,
    `MATCH (send:Control {id: "send-quote"}), (rule:Rule {id: "send-quote"})
     CREATE (send)-[:GOVERNED_BY]->(rule)
     WITH 1 AS _
     MATCH (discount:Control {id: "discount"}), (cap:Rule {id: "discount-cap"})
     CREATE (discount)-[:GOVERNED_BY]->(cap)`,
  );

  const authoredNames = (await readdir(authoredDocsDirectory)).filter((name) => name.endsWith(".md"));
  const authoredRows = authoredNames.map((fileName) => ({
    id: fileName.replace(/\.md$/, ""),
    title: fileName.replace(/\.md$/, "").replace(/-/g, " "),
    source: path.posix.join("data/docs/authored", fileName),
    governs: fileName === "discount-policy.md" || fileName === "sending-a-quote.md",
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
