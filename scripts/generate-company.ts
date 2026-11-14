import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildCompanyData } from "./company-data.ts";
import { dataDirectory, recordsDirectory, authoredDocsDirectory } from "./paths.ts";
import { writeGeneratedDocs } from "./generate-docs.ts";

const company = buildCompanyData(15);

const contacts = company.accounts.map((account) => ({
  id: `contact-${account.id}`,
  accountId: account.id,
  name: account.buyerName,
  role: "buyer",
}));

const recordFiles: Record<string, unknown> = {
  "offices.json": company.offices,
  "warehouses.json": company.warehouses,
  "territories.json": company.territories,
  "employees.json": company.employees,
  "accounts.json": company.accounts,
  "contacts.json": contacts,
  "suppliers.json": company.suppliers,
  "products.json": company.products,
  "price-books.json": company.priceBooks,
  "opportunities.json": company.opportunities,
  "line-items.json": company.lineItems,
  "activity.json": company.activity,
  "quotes.json": company.quotes,
  "orders.json": company.orders,
  "invoices.json": company.invoices,
  "shipments.json": company.shipments,
  "inventory.json": company.inventory,
  "purchase-orders.json": company.purchaseOrders,
  "cases.json": company.cases,
  "approvals.json": company.approvals,
};

await mkdir(recordsDirectory, { recursive: true });
await mkdir(authoredDocsDirectory, { recursive: true });
await writeFile(path.join(dataDirectory, "rules.json"), `${JSON.stringify(company.rules, null, 2)}\n`);
await writeFile(path.join(dataDirectory, "ui.json"), `${JSON.stringify(company.ui, null, 2)}\n`);

for (const [fileName, value] of Object.entries(recordFiles)) {
  await writeFile(path.join(recordsDirectory, fileName), `${JSON.stringify(value, null, 2)}\n`);
}

const productHeader = "sku,name,family,unit,price,supplierId";
const productRows = company.products.map(
  (product) => `${product.sku},${product.name},${product.family},${product.unit},${product.price},${product.supplierId}`,
);
await writeFile(path.join(dataDirectory, "products.csv"), `${productHeader}\n${productRows.join("\n")}\n`);

for (const document of company.authoredDocuments) {
  await writeFile(path.join(authoredDocsDirectory, document.fileName), document.body);
}

const generatedCount = await writeGeneratedDocs();
console.log(`wrote records, ${company.authoredDocuments.length} authored docs, ${generatedCount} generated docs`);
console.log(`employees ${company.employees.length} accounts ${company.accounts.length} products ${company.products.length}`);
