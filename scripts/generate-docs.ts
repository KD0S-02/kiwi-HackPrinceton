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
  const cases = await readRecords("cases.json");
  const employees = await readRecords("employees.json");

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

${account.name} is a Fieldnote restaurant in the ${territory?.name} territory. The buyer is ${account.buyerName}. The account executive who owns it is ${owner?.name}. The warehouse that serves the account is ${warehouse?.name}.

The usual order is ${account.usualOrder}. That sentence is the standing buy, not a discount and not a quote. Price talks still happen on the opportunity. This brief does not set a percent.

Delivery follows the territory window. A shortage is checked on the inventory row for ${warehouse?.name} before anyone promises the next truck.
`,
    });
  }

  for (const product of products) {
    const supplier = supplierById.get(String(product.supplierId));
    const stockedAt = inventory.filter((row) => row.productId === product.id);
    const warehouseNames = stockedAt
      .map((row) => warehouseById.get(String(row.warehouseId))?.name)
      .filter(Boolean)
      .join(", ");
    files.push({
      fileName: `product-${product.id}.md`,
      body: `# ${product.name}

Kind: product
Department: ops
Roles: account executive
Module: Products

${product.name} is a ${product.family} item, sku ${product.sku}, sold by the ${product.unit}. The supplier is ${supplier?.name}. The standard price is ${product.price}.

It is stocked at ${warehouseNames}. The on-hand count lives in inventory, not in this sheet. Handle it with the rest of its family: cold items stay cold, oil and paper stay dry.

This sheet does not authorize a discount. The discount policy is a different page.
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

${supplier.name} supplies ${supplier.category} to Fieldnote. Claims against a bad delivery start with this supplier, then the purchase order that receiving was matching.

A supplier note is not a price book and not a discount cap.
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

Order ${order.id} for ${account?.name} is ${order.status}. It ships from ${warehouse?.name}. The amount on the order is ${order.amount}. This note is history. It is not the open Harbor Diner quote.
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

Case ${supportCase.id} is a ${supportCase.kind} for ${account?.name}. Status is ${supportCase.status}. The owner is the account executive on the restaurant. A case does not change the discount cap and does not press Send Quote.
`,
    });
  }

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
