export type AuthoredDocument = {
  fileName: string;
  title: string;
  kind: "policy" | "howto";
  department: string;
  roles: string[];
  module: string;
  body: string;
};

const restaurantNames = [
  "Harbor Diner",
  "Cedar Spoon",
  "Lantern Noodle",
  "Bright Pie",
  "North Fork Grill",
  "Little Anchor",
  "Red Kettle",
  "Maple Counter",
  "Goldfinch Cafe",
  "River Salt",
  "Olive Room",
  "Paper Lantern",
  "Sunday Roast",
  "Blue Plate Yard",
  "Kindling Pizza",
  "The Copper Pot",
  "Low Tide Tacos",
  "Orchard Table",
  "Steam House",
  "Fennel & Rye",
  "Dockside Bowls",
  "Night Market Kitchen",
  "Butter Street",
  "The Green Apron",
  "Saltbox Supper",
  "Juniper Deli",
  "East Window",
  "Pebble Cafe",
  "Harvest Room",
  "Two Bell Pizza",
  "Cinder Bakery",
  "The Late Owl",
  "Marlow's Lunch",
  "Field & Fork",
  "Sunny Side Counter",
  "Brick Oven North",
  "The Quiet Bun",
  "Lemon Yard",
  "Atlas Noodles",
  "Corner Hearth",
];

const otherEmployeeNames = [
  "Priya Shah",
  "Chris Alvarez",
  "Morgan Blake",
  "Elena Vasquez",
  "Noah Patel",
  "Grace Kim",
  "Owen Brooks",
  "Hannah Diaz",
  "Leo Nguyen",
  "Jack Romero",
  "Sofia Berg",
  "Ethan Cole",
  "Ava Rahman",
  "Liam Ortiz",
  "Nora Kapoor",
  "Ben Cho",
  "Iris Feldman",
  "Theo March",
  "Camille Brooks",
  "Derek Huang",
  "Paige Lerner",
  "Omar Farouk",
  "Nina Solis",
  "Victor Adeyemi",
  "Holly Grant",
  "Quinn Parker",
  "Felix Rahman",
];

const productCatalog = [
  ["napkins", "Napkins", "paper", "case"],
  ["fryer-oil", "Fryer oil", "oil", "jug"],
  ["gloves", "Gloves", "paper", "box"],
  ["butter", "Butter", "dairy", "case"],
  ["cheddar", "Cheddar", "dairy", "wheel"],
  ["cream", "Heavy cream", "dairy", "quart"],
  ["milk", "Whole milk", "dairy", "gallon"],
  ["yogurt", "Plain yogurt", "dairy", "tub"],
  ["rice", "Jasmine rice", "dry goods", "bag"],
  ["flour", "All purpose flour", "dry goods", "bag"],
  ["sugar", "Granulated sugar", "dry goods", "bag"],
  ["salt", "Kosher salt", "dry goods", "box"],
  ["pasta", "Spaghetti", "dry goods", "case"],
  ["beans", "Black beans", "dry goods", "case"],
  ["oats", "Rolled oats", "dry goods", "bag"],
  ["cans", "Crushed tomatoes", "dry goods", "case"],
  ["towels", "Kitchen towels", "paper", "case"],
  ["foil", "Aluminum foil", "paper", "box"],
  ["wrap", "Plastic wrap", "paper", "box"],
  ["containers", "Deli containers", "paper", "case"],
  ["cups", "Paper cups", "paper", "case"],
  ["lids", "Cup lids", "paper", "case"],
  ["straws", "Paper straws", "paper", "box"],
  ["bags", "Takeout bags", "paper", "bundle"],
  ["spatula", "Offset spatula", "smallwares", "each"],
  ["tongs", "Locking tongs", "smallwares", "each"],
  ["ladle", "Stainless ladle", "smallwares", "each"],
  ["sheet-pan", "Half sheet pan", "smallwares", "each"],
  ["hotel-pan", "Hotel pan", "smallwares", "each"],
  ["thermometer", "Probe thermometer", "smallwares", "each"],
  ["peeler", "Y peeler", "smallwares", "each"],
  ["knife", "Chef knife", "smallwares", "each"],
  ["canola", "Canola oil", "oil", "jug"],
  ["olive-oil", "Olive oil", "oil", "bottle"],
  ["spray", "Pan spray", "oil", "can"],
  ["vinegar", "White vinegar", "dry goods", "gallon"],
  ["honey", "Wildflower honey", "dry goods", "jar"],
  ["pepper", "Black pepper", "dry goods", "tin"],
  ["baking-soda", "Baking soda", "dry goods", "box"],
  ["filters", "Fryer filters", "oil", "pack"],
] as const;

const supplierNames = [
  "Northline Foods",
  "Harbor Mills",
  "Cedar Dairy Co",
  "Paperlane Supply",
  "Iron Pan Works",
  "Great Lakes Oil",
  "Metro Dry Goods",
  "Atlas Smallwares",
];

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function money(index: number): number {
  return 800 + index * 137;
}

export function buildCompanyData(discountCapPercent: number) {
  const offices = [
    { id: "jersey-city", name: "Jersey City", city: "Jersey City" },
    { id: "chicago", name: "Chicago", city: "Chicago" },
  ];
  const warehouses = [
    { id: "jersey-city-cold", name: "Jersey City cold", officeId: "jersey-city", kind: "cold" },
    { id: "chicago-dry", name: "Chicago dry", officeId: "chicago", kind: "dry" },
    { id: "newark-dry-goods", name: "Newark dry goods", officeId: "jersey-city", kind: "dry goods" },
  ];
  const territories = [
    { id: "northeast", name: "Northeast", officeId: "jersey-city" },
    { id: "southeast", name: "Southeast", officeId: "jersey-city" },
    { id: "midwest", name: "Midwest", officeId: "chicago" },
    { id: "west", name: "West", officeId: "chicago" },
  ];

  const employees = [
    {
      id: "sam-ortiz",
      name: "Sam Ortiz",
      role: "VP of Sales",
      department: "sales",
      reportsTo: null,
      territoryId: null,
      officeId: "jersey-city",
    },
    {
      id: "alex-morgan",
      name: "Alex Morgan",
      role: "manager",
      department: "sales",
      reportsTo: "sam-ortiz",
      territoryId: "northeast",
      officeId: "jersey-city",
    },
    {
      id: "user",
      name: "User",
      role: "account executive",
      department: "sales",
      reportsTo: "alex-morgan",
      territoryId: "northeast",
      officeId: "jersey-city",
    },
    {
      id: "ae-southeast",
      name: otherEmployeeNames[0],
      role: "account executive",
      department: "sales",
      reportsTo: "alex-morgan",
      territoryId: "southeast",
      officeId: "jersey-city",
    },
    {
      id: "ae-midwest",
      name: otherEmployeeNames[1],
      role: "account executive",
      department: "sales",
      reportsTo: "alex-morgan",
      territoryId: "midwest",
      officeId: "chicago",
    },
    {
      id: "ae-west",
      name: otherEmployeeNames[2],
      role: "account executive",
      department: "sales",
      reportsTo: "alex-morgan",
      territoryId: "west",
      officeId: "chicago",
    },
    {
      id: "ae-northeast-2",
      name: otherEmployeeNames[3],
      role: "account executive",
      department: "sales",
      reportsTo: "alex-morgan",
      territoryId: "northeast",
      officeId: "jersey-city",
    },
  ];

  const departments = [
    ["sales", 6],
    ["ops", 8],
    ["warehouse", 6],
    ["finance", 3],
  ] as const;
  let nameCursor = 4;
  for (const [department, count] of departments) {
    for (let index = 0; index < count; index += 1) {
      const territory = territories[index % territories.length];
      employees.push({
        id: `${department}-${index + 1}`,
        name: otherEmployeeNames[nameCursor],
        role: department === "sales" ? "business development" : department,
        department,
        reportsTo: department === "sales" ? "alex-morgan" : "sam-ortiz",
        territoryId: territory.id,
        officeId: territory.officeId,
      });
      nameCursor += 1;
    }
  }

  const accountExecutiveIds = employees
    .filter((employee) => employee.role === "account executive")
    .map((employee) => employee.id);

  const accounts = restaurantNames.map((name, index) => {
    const territory = territories[index % territories.length];
    const ownerId = index < 8 ? "user" : accountExecutiveIds[index % accountExecutiveIds.length];
    const warehouseId = territory.officeId === "chicago" ? "chicago-dry" : index % 2 === 0 ? "jersey-city-cold" : "newark-dry-goods";
    return {
      id: slug(name),
      name,
      territoryId: territory.id,
      warehouseId,
      ownerId,
      buyerName: otherEmployeeNames[index % otherEmployeeNames.length],
      usualOrder:
        name === "Harbor Diner"
          ? "napkins, fryer oil, and gloves"
          : `${productCatalog[index % productCatalog.length][1]} and ${productCatalog[(index + 3) % productCatalog.length][1]}`,
    };
  });

  const suppliers = supplierNames.map((name, index) => ({
    id: slug(name),
    name,
    category: ["dairy", "dry goods", "dairy", "paper", "smallwares", "oil", "dry goods", "smallwares"][index],
  }));

  const products = productCatalog.map(([id, name, family, unit], index) => ({
    id,
    name,
    sku: `FN-${String(index + 1).padStart(3, "0")}`,
    family,
    unit,
    price: 4 + (index % 9) * 3.5,
    supplierId: suppliers[index % suppliers.length].id,
  }));

  const priceBooks = [
    { id: "standard", name: "Standard" },
    { id: "northeast", name: "Northeast" },
  ];

  const opportunities = accounts.slice(0, 20).map((account, index) => ({
    id: account.id === "harbor-diner" ? "opp-harbor-diner" : `opp-${account.id}`,
    name: account.name,
    accountId: account.id,
    ownerId: account.ownerId,
    stage: account.id === "harbor-diner" ? "Proposal" : ["Qualify", "Proposal", "Commit"][index % 3],
    amount: account.id === "harbor-diner" ? 12400 : money(index),
    discountPercent: account.id === "harbor-diner" ? 20 : 5 + (index % 8),
  }));

  const lineItems = [
    { id: "li-harbor-1", opportunityId: "opp-harbor-diner", productId: "napkins", quantity: 12 },
    { id: "li-harbor-2", opportunityId: "opp-harbor-diner", productId: "fryer-oil", quantity: 8 },
    { id: "li-harbor-3", opportunityId: "opp-harbor-diner", productId: "gloves", quantity: 6 },
  ];

  const activity = [
    {
      id: "act-harbor-1",
      opportunityId: "opp-harbor-diner",
      text: "Buyer asked for a quote on the standing napkin and oil order.",
    },
    {
      id: "act-harbor-2",
      opportunityId: "opp-harbor-diner",
      text: "Discount was left at 20 percent from the first draft. Alex Morgan has not approved it.",
    },
  ];

  const quotes = opportunities.slice(1, 13).map((opportunity, index) => ({
    id: `quote-${index + 1}`,
    opportunityId: opportunity.id,
    accountId: opportunity.accountId,
    ownerId: opportunity.ownerId,
    status: "sent",
    amount: opportunity.amount,
  }));

  const orders = accounts.slice(8, 23).map((account, index) => ({
    id: `order-${index + 1}`,
    accountId: account.id,
    warehouseId: account.warehouseId,
    status: index === 0 ? "open" : "delivered",
    amount: money(index + 3),
  }));

  const invoices = orders.map((order, index) => ({
    id: `invoice-${index + 1}`,
    orderId: order.id,
    accountId: order.accountId,
    status: order.status === "open" ? "open" : "paid",
    amount: order.amount,
  }));

  const shipments = orders.slice(0, 10).map((order, index) => ({
    id: `shipment-${index + 1}`,
    orderId: order.id,
    accountId: order.accountId,
    warehouseId: order.warehouseId,
    status: order.status === "open" ? "picking" : "delivered",
  }));

  const inventory = products.map((product, index) => ({
    id: `inv-${product.id}`,
    productId: product.id,
    warehouseId: product.id === "fryer-oil" ? "newark-dry-goods" : warehouses[index % warehouses.length].id,
    onHand: 20 + (index % 15) * 4,
  }));

  const purchaseOrders = Array.from({ length: 8 }, (_, index) => ({
    id: `po-${index + 1}`,
    supplierId: suppliers[index].id,
    warehouseId: warehouses[index % warehouses.length].id,
    status: index === 0 ? "open" : "received",
  }));

  const caseKinds = ["delivery complaint", "billing question", "missing item"];
  const cases = Array.from({ length: 12 }, (_, index) => ({
    id: `case-${index + 1}`,
    accountId: accounts[index].id,
    ownerId: accounts[index].ownerId,
    kind: caseKinds[index % caseKinds.length],
    status: index < 4 ? "open" : "closed",
  }));

  const approvals = Array.from({ length: 5 }, (_, index) => ({
    id: `approval-${index + 1}`,
    opportunityId: opportunities[index + 1].id,
    requestedBy: opportunities[index + 1].ownerId,
    approverId: "alex-morgan",
    kind: "discount",
    status: "pending",
  }));

  const rules = {
    discountCapPercent,
    sendQuote: "own opportunities",
  };

  const ui = {
    modules: [
      "Home",
      "Accounts",
      "Contacts",
      "Opportunities",
      "Quotes",
      "Orders",
      "Invoices",
      "Products",
      "Price Books",
      "Inventory",
      "Warehouses",
      "Suppliers",
      "Purchase Orders",
      "Shipments",
      "Cases",
      "Approvals",
      "People",
      "Reports",
    ],
    controls: [
      { id: "send-quote", name: "Send Quote", module: "Opportunity", where: "header" },
      { id: "discount", name: "Discount", module: "Opportunity", where: "header" },
      { id: "amount", name: "Amount", module: "Opportunity", where: "header" },
      { id: "stage", name: "Stage", module: "Opportunity", where: "header" },
    ],
  };

  return {
    offices,
    warehouses,
    territories,
    employees,
    accounts,
    suppliers,
    products,
    priceBooks,
    opportunities,
    lineItems,
    activity,
    quotes,
    orders,
    invoices,
    shipments,
    inventory,
    purchaseOrders,
    cases,
    approvals,
    rules,
    ui,
    authoredDocuments: authoredDocuments(discountCapPercent),
  };
}

function authoredDocuments(discountCapPercent: number): AuthoredDocument[] {
  const cap = `${discountCapPercent} percent`;
  const sharedRoles = ["account executive"];
  return [
    doc("discount-policy.md", "Discount policy", "policy", "sales", sharedRoles, "Opportunities", `
An account executive may discount up to ${cap} on an opportunity they own. The cap is ${discountCapPercent} percent, not a suggestion and not a starting point for a negotiation inside the form. A discount of 20 percent is over the cap. A discount of ${discountCapPercent} percent is the last value the account executive may enter without help.

The same role may send a quote on their own opportunities when the discount on the screen is at or under ${cap}. Send Quote sits on the Opportunity header, next to the discount field. Pressing it while the field is over the cap does nothing. The page keeps the button visible so the account executive can see where the send would have happened.

Alex Morgan approves anything over ${cap}. Alex is the manager for the Northeast, and User reports to Alex. The approval is a person, not a second button on the header. Leaving the field at 20 percent and asking the system to send is refused until the field comes down or Alex approves the exception.

Fieldnote uses one cap for every territory. The Northeast price book does not raise it. A sample, a first order, or a busy Friday does not raise it. If two account executives work the same restaurant, only the owner of that opportunity may send the quote.
`),
    doc("sending-a-quote.md", "Sending a quote", "howto", "sales", sharedRoles, "Opportunities", `
Open the opportunity. The send lives on the Opportunity header, not on the account, not in Quotes, and not in a menu buried in Details. The header shows the restaurant, the stage, the amount, the discount field, and Send Quote.

Read the discount field before you touch Send Quote. If the number is over the cap in the discount policy, the button stays visible and does not send. Change the discount field, save it, and look again. The new number has to be on the screen. The quote list does not grow until the send actually lands.

Details holds the restaurant and the line items. Products holds what is on this deal. Activity holds the notes. None of those subtabs is where the send happens. A walk-through of the page ends by naming the next place, and the next place for a quote is still the header.

After a successful send, Quotes shows a new row for that opportunity. Harbor Diner does not have a sent quote while the discount is still 20 percent. That empty spot is the check that the button was refused.
`),
    doc("approval-matrix.md", "Approval matrix", "policy", "sales", sharedRoles, "Approvals", `
Discounts over the account executive cap go to Alex Morgan. Alex is the manager. Sam Ortiz is the VP of Sales and is the next person only when Alex is out. An account executive does not approve their own exception.

The Approvals list holds pending discount requests. A pending row is not permission to press Send Quote. The opportunity still has to show a discount at or under the cap, or the approval has to be recorded, before the header button will send.

User's open Harbor Diner opportunity is not in the pending approval list. The five pending rows belong to other opportunities. Do not treat someone else's pending approval as a reason to raise Harbor Diner.

Territory does not change the approver. Northeast, Southeast, Midwest, and West all use the same cap and the same manager path for a discount exception.
`),
    doc("first-week.md", "First week for an account executive", "howto", "sales", sharedRoles, "Home", `
Day two is for the opportunities already on your name. Home lists them. User's list includes Harbor Diner. The stage is Proposal, the amount is 12400, and the discount field was left high on the first draft.

Learn the header before the rest of the navigation. Send Quote and the discount field are both on the Opportunity header. The long navigation is real: accounts, orders, inventory, warehouses, cases. You do not need all of it to send a quote you are allowed to send.

Your manager is Alex Morgan. Your territory is Northeast. Your office is Jersey City. Restaurants in the Northeast are served from the Jersey City cold warehouse or the Newark dry goods warehouse.

Read the discount policy before you promise a number on a call. The cap is the policy, and the screen is where you see the number that is actually saved.
`),
    doc("pricing-exceptions.md", "Pricing exceptions", "policy", "sales", sharedRoles, "Price Books", `
The Standard price book is the default. The Northeast price book is a standing adjustment for restaurants in that territory. Neither book changes the discount cap. A price book is the list price. A discount is what you take off an opportunity.

Ask Alex Morgan before you invent a third book for one restaurant. A one-time deal is a discount on the opportunity, and it still stops at the cap unless Alex approves it.

Do not type a price-book change into the discount field. The discount field is a percent. The price book is chosen for the territory, and Harbor Diner is Northeast.
`),
    doc("credit-holds.md", "Credit holds", "policy", "finance", ["account executive", "finance"], "Accounts", `
Finance places a credit hold on an account when invoices are open past the agreed window. A hold blocks a new order. It does not change the discount cap and it does not move Send Quote.

The account page shows the hold. The opportunity header does not. If Harbor Diner is not on hold, the reason Send Quote is disabled is the discount, not credit.

An account executive asks finance to clear a hold. Alex Morgan does not clear credit. Sam Ortiz does not clear credit. The finance team owns the hold.
`),
    doc("returns.md", "Returns", "policy", "ops", sharedRoles, "Orders", `
A restaurant can return unopened dry goods within five days of delivery. Dairy and opened oil do not come back. The driver notes the refusal on the shipment. The case type for a dispute after that is a billing question or a missing item, not a silent credit.

Returns do not change a quote that has not been sent. Harbor Diner's draft is still an opportunity. There is no order to return until a quote is sent and an order exists.

Napkins and gloves can return unopened. Fryer oil comes back only if the seal is intact and the jug was refused at the door.
`),
    doc("samples.md", "Samples", "policy", "sales", sharedRoles, "Opportunities", `
A sample is a small first shipment, not a discount over the cap. Samples still belong to an opportunity the account executive owns. They do not create a second send button.

Mark the sample in Activity. Do not hide it by typing a larger percent into the discount field. Alex Morgan still has to approve any percent over the cap, including a sample someone described as free.

Harbor Diner's usual order is napkins, fryer oil, and gloves. A sample of that order is still priced on the opportunity, then discounted within the cap.
`),
    doc("substitutions.md", "Substitutions", "policy", "ops", sharedRoles, "Products", `
When a product is short, ops substitutes within the same family and tells the buyer before the truck leaves. Canola oil can cover fryer oil only if the restaurant agreed. Paper napkins do not get replaced with a linen rental.

The product sheet says which warehouse stocks the item. The substitute has to be stocked at the warehouse that serves that account. Newark dry goods stocks fryer oil. A substitute that is only in Chicago does not go on a Northeast truck the same day.

Write the substitution on the order. Do not write it into the discount field.
`),
    doc("food-safety.md", "Food safety", "policy", "warehouse", ["account executive", "warehouse"], "Warehouses", `
Cold product leaves Jersey City cold on a checked trailer. Dry goods leave Newark dry goods or Chicago dry. A case that sweats, leaks, or sits out of range is not loaded.

Account executives do not override a temperature refusal from the warehouse. The warehouse lead records it. A restaurant complaint about warm dairy becomes a case, and the next delivery is from in-range stock.

Fryer oil is dry storage. Butter, cream, milk, yogurt, and cheddar are cold storage. Do not tell a buyer that oil ships from the cold room.
`),
    doc("delivery-windows.md", "Delivery windows", "policy", "ops", sharedRoles, "Shipments", `
Northeast restaurants receive on Tuesday and Friday. Midwest restaurants receive on Wednesday. West restaurants receive on Thursday. The window is the morning drop, before lunch prep.

A missed window moves to the next scheduled day. It does not become a reason to discount the opportunity. Drivers call the buyer when they will miss the window by more than an hour.

Harbor Diner is Northeast, so the standing days are Tuesday and Friday. The shipment list shows status. The opportunity header does not.
`),
    doc("shortages.md", "Shortages", "howto", "ops", sharedRoles, "Inventory", `
Inventory shows on-hand by product and warehouse. A zero at Newark dry goods means the Northeast cannot promise that item for the next Tuesday. Check Chicago only when the restaurant can wait for a transfer.

Tell the buyer what is short before you send a quote that includes it. The quote should match what the warehouse can ship. A shortage is not fixed by raising the discount.

Fryer oil on-hand lives on the Newark dry goods row. If that row is low, say so on the Harbor Diner activity note.
`),
    doc("invoice-disputes.md", "Invoice disputes", "howto", "finance", ["account executive", "finance"], "Invoices", `
A billing question starts as a case and points at an invoice. The account executive gathers what the buyer says. Finance decides the credit. Do not issue the credit by editing an open opportunity's discount.

Open invoices stay open until finance posts the credit or the payment. The invoice list is the place to see status. Quotes are not invoices. Harbor Diner has no sent quote yet, so it has no invoice from this draft.

Write the dispute in the case. Leave the opportunity discount alone unless the buyer is negotiating the next order.
`),
    doc("new-account-setup.md", "New account setup", "howto", "sales", sharedRoles, "Accounts", `
A new restaurant needs a name, a territory, a warehouse, an owner, and a buyer. Northeast accounts belong to the Jersey City office. The owner is the account executive who will send quotes.

User owns Harbor Diner and seven other restaurants. A restaurant owned by another account executive is visible in the list and is not yours to send. The send rule is own opportunities.

The buyer name on the account is who answers the phone. It is not the Fieldnote employee. Do not put Alex Morgan in the buyer field.
`),
    doc("commission.md", "Commission", "policy", "sales", sharedRoles, "Reports", `
Commission follows the owner of the opportunity after the quote is sent and the order is invoiced. A discount within the cap still commissions. A discount Alex Morgan approved commissions at the approved percent, not at a number someone typed and could not send.

Reports lists open opportunities with owner, stage, amount, and discount. It is a table, not a payout. Finance runs the payout from invoices.

User is paid on User's restaurants. Helping on Priya Shah's account does not move the owner.
`),
    doc("territory-rules.md", "Territory rules", "policy", "sales", sharedRoles, "Accounts", `
Northeast is User's territory, with one other account executive beside User. Southeast, Midwest, and West have their own account executives. The office for Northeast and Southeast is Jersey City. Midwest and West sit in Chicago.

You can see accounts outside your territory. You send quotes on opportunities you own. Owning is the owner field, not the fact that you can open the page.

Harbor Diner is Northeast. Its warehouses are the Jersey City cold room and Newark dry goods. Chicago dry does not serve it on a normal week.
`),
    doc("warehouse-receiving.md", "Warehouse receiving", "howto", "warehouse", ["account executive", "warehouse"], "Purchase Orders", `
Receiving starts with the purchase order. The open purchase order is the one that has not been received. Match the supplier, the warehouse, and the count on the dock before you put product away.

Newark dry goods receives dry grocery, paper, and oil. Jersey City cold receives dairy. Chicago dry receives the Midwest building. A jug of fryer oil scanned into the cold room is a mistake.

Account executives do not receive. They can read the purchase order so they do not promise stock that is still on the truck.
`),
    doc("cycle-counts.md", "Cycle counts", "howto", "warehouse", ["warehouse"], "Inventory", `
Each warehouse counts a family every week. Oil is counted at Newark dry goods. Dairy is counted at Jersey City cold. The count replaces the on-hand number. It does not create a quote.

A variance over a case is a warehouse note, then a recount. It is not a discount for the restaurants that buy the item.

Account executives are not asked to enter cycle counts. The inventory page is there so they can see what the recount left behind.
`),
    doc("driver-exceptions.md", "Driver exceptions", "howto", "ops", sharedRoles, "Shipments", `
A driver exception is a missed window, a refusal, or a short at the door. The shipment status changes. A case is opened when the buyer disputes it after the truck leaves.

The driver does not renegotiate the opportunity discount at the curb. Price talks stay on the opportunity, with the cap, before the order exists.

Write the exception on the shipment. The opportunity header is the wrong place for a door refusal.
`),
    doc("case-handling.md", "Case handling", "howto", "ops", sharedRoles, "Cases", `
Cases are delivery complaints, billing questions, and missing items. Open cases show on Home for the account owner. User sees cases on restaurants User owns.

Close a case when the buyer has the credit, the replacement, or a clear no. Alex Morgan is not the default owner of a case. The account executive who owns the restaurant is.

A case does not enable Send Quote. The discount rule is separate. A friendly resolution on a missing napkin case is not approval to discount Harbor Diner past the cap.
`),
    doc("supplier-claims.md", "Supplier claims", "howto", "ops", ["account executive", "ops"], "Suppliers", `
A supplier claim starts when receiving rejects a delivery or a restaurant finds a defect that receiving could not have seen. The supplier on the product is the company that is billed. Fryer oil's supplier is the oil supplier on the product record, not the warehouse.

Claims do not change the price book by themselves. They do not change the discount cap.

Ops writes the claim. The account executive tells the buyer what is coming as a replacement, using the substitution rules.
`),
    doc("product-recall.md", "Product recall", "policy", "ops", sharedRoles, "Products", `
A recall stops the product at every warehouse that stocks it. The warehouse does not load it. Open orders lose that line. Account executives call the buyers who received it in the last window.

A recall is not a discount. Do not soften it by editing the opportunity percent. The product sheet and the inventory row are the places that show the stop.

If fryer oil were recalled, Newark dry goods would be the first building to freeze, because that is where the on-hand row lives.
`),
    doc("after-hours-orders.md", "After hours orders", "policy", "ops", sharedRoles, "Orders", `
Orders placed after the warehouse cutoff ship on the next window, not the same night. Northeast cutoff is the afternoon before Tuesday or Friday. A phone call to Alex Morgan does not open the building.

The after-hours order is still an order, with a warehouse and a status. It is not a quote. Send Quote remains the header button on the opportunity, and it still obeys the discount cap.

Tell the buyer the next window from the delivery policy. Harbor Diner's next days are Tuesday and Friday.
`),
    doc("northeast-price-book.md", "Northeast price book", "policy", "sales", sharedRoles, "Price Books", `
The Northeast price book applies to restaurants whose territory is Northeast. Harbor Diner uses it. The book changes list price. It does not change how far an account executive may discount.

User sells against that book. The discount field on the opportunity is still a percent off the deal, capped by the discount policy. Stacking a book discount and a percent over the cap is still over the cap.

Price Books in the navigation shows the two books: Standard and Northeast. There is no third book for a single diner.
`),
  ];
}

function doc(
  fileName: string,
  title: string,
  kind: "policy" | "howto",
  department: string,
  roles: string[],
  module: string,
  body: string,
): AuthoredDocument {
  return {
    fileName,
    title,
    kind,
    department,
    roles,
    module,
    body: `# ${title}\n\n${body.trim()}\n`,
  };
}
