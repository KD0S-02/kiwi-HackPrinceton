import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { generatedDocsDirectory, recordsDirectory } from "./paths.ts";

type Row = Record<string, string | number | null>;

async function readRecords(fileName: string): Promise<Row[]> {
  const contents = await readFile(path.join(recordsDirectory, fileName), "utf8");
  return JSON.parse(contents) as Row[];
}

export async function writeGeneratedDocs(): Promise<number> {
  const accounts = await readRecords("accounts.json");
  const products = await readRecords("products.json");
  const suppliers = await readRecords("suppliers.json");
  const warehouses = await readRecords("warehouses.json");
  const territories = await readRecords("territories.json");
  const inventory = await readRecords("inventory.json");
  const orders = await readRecords("orders.json");
  const orderLines = await readRecords("order-lines.json");
  const invoices = await readRecords("invoices.json");
  const shipments = await readRecords("shipments.json");
  const shipmentLines = await readRecords("shipment-lines.json");
  const quotes = await readRecords("quotes.json");
  const opportunities = await readRecords("opportunities.json");
  const cases = await readRecords("cases.json");
  const employees = await readRecords("employees.json");
  const rules = JSON.parse(await readFile(path.join(recordsDirectory, "../rules.json"), "utf8")) as {
    discountCapPercent: number;
    deliveryDays: Record<string, string>;
  };

  const byId = (rows: Row[]) => new Map(rows.map((row) => [String(row.id), row]));
  const accountById = byId(accounts);
  const productById = byId(products);
  const supplierById = byId(suppliers);
  const warehouseById = byId(warehouses);
  const territoryById = byId(territories);
  const employeeById = byId(employees);

  await rm(generatedDocsDirectory, { recursive: true, force: true });
  await mkdir(generatedDocsDirectory, { recursive: true });

  const files: { fileName: string; body: string }[] = [];

  for (const account of accounts) {
    const territory = territoryById.get(String(account.territoryId));
    const warehouse = warehouseById.get(String(account.warehouseId));
    const owner = employeeById.get(String(account.ownerId));
    files.push({
      fileName: `account-${account.id}.md`,
      body: `# ${account.name}

Kind: account
Department: sales
Roles: account executive
Module: Accounts
Account: ${account.id}

${account.name} is a Fieldnote restaurant in the ${territory?.name} territory. The buyer is ${account.buyerName}. The account executive who owns it is ${owner?.name}. The warehouse on the account is ${warehouse?.name}. Status is ${account.status ?? "active"}. The price book is ${account.priceBookId ?? "standard"}. Delivery days are ${account.deliveryDays || rules.deliveryDays[String(account.territoryId)] || "the territory days"}.

Credit limit is ${account.creditLimit ?? "not set"} on ${account.paymentTerms ?? "net 30"}. Credit status is ${account.creditStatus ?? "none"}. ${account.creditHold === "yes" ? `The account is on credit hold: ${account.holdReason}` : "The account is not on credit hold."} A hold blocks a new order and does not change the ${rules.discountCapPercent} percent discount cap.

The usual order is ${account.usualOrder}. That sentence is the standing buy, not a discount and not a quote. Price talks still happen on the opportunity. This brief does not set a percent.

Open invoices on this account, and any past-due balance, are on the invoice pages. Short deliveries are on the case pages. A shortage is checked against free stock before anyone promises the next truck.
`,
    });
  }

  for (const product of products) {
    const supplier = supplierById.get(String(product.supplierId));
    const stockedAt = inventory.filter((row) => row.productId === product.id);
    const stockLines = stockedAt.map((row) => {
      const name = warehouseById.get(String(row.warehouseId))?.name ?? row.warehouseId;
      return `${name}: ${row.onHand} on hand, reorder at ${row.reorderPoint ?? "n/a"}, reorder quantity ${row.reorderQty ?? "n/a"}`;
    }).join(". ");
    files.push({
      fileName: `product-${product.id}.md`,
      body: `# ${product.name}

Kind: product
Department: ops
Roles: account executive
Module: Products

${product.name} is a ${product.family} item, sku ${product.sku}, sold by the ${product.unit}. The supplier is ${supplier?.name}. The standard price is ${product.price}. The cost on a purchase order is ${product.cost ?? "the supplier cost"}.

Stock: ${stockLines || "no warehouse row"}. Free stock is on hand minus what open orders have already allocated. A quote or a redelivery that needs more than the free count is refused. Below the reorder point, Supply offers a reorder to ${supplier?.name}.

Handle it with the rest of its family. Jersey City cold receives dairy. Newark dry goods and Chicago dry receive dry goods, paper, oil, and smallwares. This sheet does not authorize a discount. The discount policy is a different page.
`,
    });
  }

  for (const supplier of suppliers) {
    files.push({
      fileName: `supplier-${supplier.id}.md`,
      body: `# ${supplier.name}

Kind: supplier
Department: ops
Roles: account executive
Module: Suppliers

${supplier.name} supplies ${supplier.category} to Fieldnote. A purchase order to this supplier has a minimum of ${supplier.minOrderDollars ?? 500} dollars and a lead time of ${supplier.leadDays ?? "several"} days. Submit is refused under the minimum. The expected date is the send date plus the lead time. A purchase order over 5000 dollars waits for Krishna Das.

Claims against a bad delivery start with this supplier, then the purchase order that receiving was matching. A supplier note is not a price book and not a discount cap.
`,
    });
  }

  for (const warehouse of warehouses) {
    files.push({
      fileName: `warehouse-${warehouse.id}.md`,
      body: `# ${warehouse.name}

Kind: warehouse
Department: warehouse
Roles: account executive, warehouse
Module: Warehouses

${warehouse.name} is a ${warehouse.kind} building at the ${warehouse.officeId} office. Receiving matches the purchase order on this dock. Cycle counts for this building replace the on-hand numbers for products stocked here.

Account executives read this page to see where a product ships from. They do not receive freight here.
`,
    });
  }

  for (const order of orders) {
    const account = accountById.get(String(order.accountId));
    const warehouse = warehouseById.get(String(order.warehouseId));
    files.push({
      fileName: `order-${order.id}.md`,
      body: `# Order ${order.id} for ${account?.name}

Kind: case
Department: ops
Roles: account executive
Module: Orders
Account: ${order.accountId}

Order ${order.id} for ${account?.name} is ${order.status}. It ships from ${warehouse?.name}. The amount is ${order.amount}. Delivery date is ${order.deliveryDate || "not set"}. ${order.holdReason ? `Hold reason: ${order.holdReason}` : "It is not on a credit hold of its own."} ${order.quoteId ? `It was converted from ${order.quoteId}.` : "It did not come from a quote version."}

Lines: ${orderLines.filter((line) => line.orderId === order.id).map((line) => `${line.quantity} ${productById.get(String(line.productId))?.name ?? line.productId} at ${line.unitPrice}, allocated ${line.allocated ?? 0}, backordered ${line.backordered ?? 0}`).join("; ") || "none"}.

A held order stays held until the account hold is released and someone releases the order. A backordered order fills when receiving raises free stock and backorders are released. This note is not the Harbor Diner discount.
`,
    });
  }

  for (const supportCase of cases) {
    const account = accountById.get(String(supportCase.accountId));
    files.push({
      fileName: `case-${supportCase.id}.md`,
      body: `# ${supportCase.kind} at ${account?.name}

Kind: case
Department: ops
Roles: account executive
Module: Cases
Account: ${supportCase.accountId}

Case ${supportCase.id} is a ${supportCase.kind} for ${account?.name}. Subject: ${supportCase.subject || supportCase.kind}. Status is ${supportCase.status}. The owner is ${employeeById.get(String(supportCase.ownerId))?.name ?? "the account executive"}. ${supportCase.orderId ? `Linked order ${supportCase.orderId}.` : ""} ${supportCase.shipmentId ? `Linked shipment ${supportCase.shipmentId}.` : ""} ${supportCase.invoiceId ? `Linked invoice ${supportCase.invoiceId}.` : ""}

Work a short delivery on the shipment lines, then a redelivery or a credit memo. The case closes only when no short is still open and no credit is still pending. A case does not change the discount cap and does not press Send Quote.
`,
    });
  }

  for (const invoice of invoices) {
    const account = accountById.get(String(invoice.accountId));
    const balance = Number(invoice.amount) - Number(invoice.paid ?? 0) - Number(invoice.credited ?? 0);
    files.push({
      fileName: `invoice-${invoice.id}.md`,
      body: `# Invoice ${invoice.id} for ${account?.name}

Kind: invoice
Department: finance
Roles: account executive, finance
Module: Invoices
Account: ${invoice.accountId}

Invoice ${invoice.id} bills order ${invoice.orderId} for ${account?.name}. Status is ${invoice.status}. Amount ${invoice.amount}, paid ${invoice.paid ?? 0}, credited ${invoice.credited ?? 0}, balance ${balance}. Issued ${invoice.issuedAt || "n/a"}, due ${invoice.dueDate || "n/a"}.

A balance still open 30 days after the due date puts the account on credit hold. A credit memo lowers the balance. A payment, posted by Krishna Das, lowers it too. Quotes are not invoices.
`,
    });
  }

  for (const shipment of shipments) {
    const account = accountById.get(String(shipment.accountId));
    const lines = shipmentLines.filter((line) => line.shipmentId === shipment.id);
    files.push({
      fileName: `shipment-${shipment.id}.md`,
      body: `# Shipment ${shipment.id} for ${account?.name}

Kind: shipment
Department: ops
Roles: account executive
Module: Shipments
Account: ${shipment.accountId}

Shipment ${shipment.id} for order ${shipment.orderId} is ${shipment.status}. Warehouse ${warehouseById.get(String(shipment.warehouseId))?.name}. Delivery date ${shipment.deliveryDate || "n/a"}. ${shipment.redeliveryOf ? `This is a redelivery of ${shipment.redeliveryOf}.` : "This is the original shipment."}

Lines: ${lines.map((line) => `${line.quantity} ${productById.get(String(line.productId))?.name ?? line.productId}, short ${line.short ?? 0}, redelivered ${line.redelivered ?? 0}, credited ${line.credited ?? 0}`).join("; ") || "none"}.

Report a short only on a delivered shipment. Redeliver what free stock can cover, on a territory delivery day. Credit the rest on the invoice.
`,
    });
  }

  for (const quote of quotes) {
    const account = accountById.get(String(quote.accountId));
    files.push({
      fileName: `quote-${quote.id}.md`,
      body: `# Quote ${quote.id} for ${account?.name}

Kind: quote
Department: sales
Roles: account executive
Module: Quotes
Account: ${quote.accountId}

Quote ${quote.id} is version ${quote.version ?? 1} of opportunity ${quote.opportunityId}. Status is ${quote.status}. Amount ${quote.amount}. Sent ${quote.sentAt || "n/a"}, valid until ${quote.validUntil || "n/a"}. ${quote.orderId ? `Converted to ${quote.orderId}.` : "Not converted to an order yet."}

Accept only the latest sent version, before the valid-until date. Convert an accepted quote on a delivery day when the account is active, not on credit hold, and inside its available credit.
`,
    });
  }

  for (const opportunity of opportunities) {
    const account = accountById.get(String(opportunity.accountId));
    const owner = employeeById.get(String(opportunity.ownerId));
    files.push({
      fileName: `opportunity-${opportunity.id}.md`,
      body: `# ${opportunity.name} opportunity

Kind: opportunity
Department: sales
Roles: account executive
Module: Opportunities
Account: ${opportunity.accountId}

${opportunity.name} is a ${opportunity.stage} opportunity for ${account?.name}, owned by ${owner?.name}. The forecast amount is ${opportunity.amount}. The discount field is ${opportunity.discountPercent} percent. The cap is ${rules.discountCapPercent} percent. ${Number(opportunity.discountPercent) > rules.discountCapPercent ? "Send Quote stays off until the discount comes down or the approver records this percent." : "The discount is within the cap, so Send Quote still depends on stock and on the owner."}

Products on the deal are checked against free stock at send time. A short line has to be substituted, with the buyer agreeing, or the quantity lowered. Sending writes a quote version. Harbor Diner's draft is the one that is still over the cap with no sent quote.
`,
    });
  }

  const low = inventory.filter((row) => Number(row.onHand) < Number(row.reorderPoint ?? 0));
  files.push({
    fileName: "stock-below-reorder.md",
    body: `# Stock below the reorder point

Kind: inventory
Department: warehouse
Roles: account executive, warehouse, owner
Module: Inventory

A row is below its reorder point when on hand is under that point. Free stock is lower still once open orders have allocated some of it. Reorder from Supply. The draft goes to the product's supplier, at that warehouse, and has to clear the supplier minimum before submit.

Rows under the point: ${low.map((row) => `${productById.get(String(row.productId))?.name} at ${warehouseById.get(String(row.warehouseId))?.name} has ${row.onHand} on hand and reorders at ${row.reorderPoint}`).join(". ") || "none"}.

Fryer oil at Newark dry goods is the demo row: 24 on hand, reorder point 40, with 18 allocated to River Salt and 12 backordered for Cedar Spoon, so 6 are free. Account executives do not receive the purchase order that refills it.
`,
  });

  for (const file of files) {
    await writeFile(path.join(generatedDocsDirectory, file.fileName), file.body);
  }

  const written = await readdir(generatedDocsDirectory);
  return written.length;
}

const isDirectRun = process.argv[1]?.endsWith("generate-docs.ts");
if (isDirectRun) {
  const count = await writeGeneratedDocs();
  console.log(`generated docs ${count}`);
}
