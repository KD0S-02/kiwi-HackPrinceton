function page(
  fileName: string,
  title: string,
  kind: "policy" | "howto",
  department: string,
  roles: string[],
  module: string,
  body: string,
) {
  return { fileName, title, kind, department, roles, module, body: `# ${title}\n\n${body.trim()}\n` };
}

const sales = ["account executive"];
const finance = ["account executive", "finance", "owner"];
const ops = ["account executive", "ops", "warehouse", "owner"];

// Written pages for the five distributor workflows. Embeddings read these files.
export function workflowDocuments(): AuthoredDocument[] {
  return [
    page("who-decides.md", "Who decides", "policy", "sales", [...sales, "owner", "finance"], "Approvals", `
Three people sign in, and each one stops at a different door.

Sparsh Bohra is an account executive. He owns his restaurants, including Harbor Diner, Dockside Bowls, North Fork Grill, and Juniper Deli. He sends quotes on that book, reports shorts, asks for credits, and proposes payment plans. He does not approve his own request, he does not post a payment, and he does not receive a purchase order.

Shail Shah is the senior account executive and Sparsh's manager. A discount over 15 percent and a credit over $100 go to Shail. Shail does not carry a personal book, so he does not send a quote on Sparsh's restaurant and he does not report a short on Dockside Bowls.

Krishna Das owns Fieldnote. He has no manager. Finance and the warehouse sit with him in this company: payment plans, credit limits over $2,500, purchase orders over $5,000, hold releases, recording a payment, receiving stock, and releasing backorders. When Krishna asks for something that would have needed an approver, it is approved at once, because nothing goes above him.

A request names one approver. Nobody decides their own request. Approving runs the effect: the credit posts, the plan becomes active, the purchase order is approved, or the hold comes off. Rejecting sends the work back.
`),
    page("short-delivery.md", "Short delivery", "howto", "ops", sales, "Cases", `
A short delivery starts as a missing-item case and ends only when every short line has a redelivery or a posted credit.

Dockside Bowls is the open example. Case case-13 says the Tuesday truck was short 4 cases of gloves and 18 jugs of fryer oil. It points at order-16, shipment-11, and invoice-16. Sparsh owns the restaurant, so he works the case. Shail can read it and cannot report the short.

Open the case, then the shipment. Report the short on each line: 4 gloves and 18 fryer oil. The case moves to investigating. A short cannot be larger than the line, and a shipment that is not delivered cannot be shorted.

Then look at free stock at the warehouses that serve the account. Gloves are free at Newark dry goods, so schedule a redelivery for 4 gloves on the next Tuesday or Friday. Fryer oil at Newark has 24 on hand and 18 already promised to River Salt, so only 6 are free. Fieldnote refuses a redelivery of 18 fryer oil and says how many are free. A Wednesday is not a Northeast delivery day.

The 18 fryer oil jugs become a credit on invoice-16, priced from the order line. A credit over $100 is a pending credit memo and an approval for Shail. It does not lower the invoice until Shail approves. Do not credit the 4 gloves after they are on a redelivery. Do not credit more than the invoice balance.

Close the case only when no line still has an open short and no credit memo is still pending. The resolution is redelivered, credited, or both. Closing early names the line or the person still waiting.
`),
    page("credit-memos.md", "Credit memos", "policy", "finance", finance, "Invoices", `
A credit memo is how Fieldnote gives money back on an invoice. It is not a discount on the next opportunity, and it is not an edit of the invoice amount.

Issue the credit from the invoice, against a short shipment line. The amount is the quantity times the unit price on the order. Credits of $100 or less post at once. Credits over $100 wait for the account executive's approver. For Sparsh that approver is Shail Shah. Krishna posts his own, because he is the last approver.

A posted memo raises the credited amount on the invoice and on the shipment line. The balance is the amount minus what has been paid minus what has been credited. The invoice is paid when the balance is zero.

A line that already has a redelivery cannot also be credited. A second memo cannot cover the same short while the first is still pending. A memo larger than the balance is refused.

The credit memo list is under Fulfillment. The Approvals list is where Shail or Krishna decides a pending one.
`),
    page("quote-versions.md", "Quote versions", "howto", "sales", sales, "Quotes", `
Sending a quote copies the products on the opportunity into a numbered version. The first send is version 1. Editing a line and sending again creates version 2 and marks version 1 superseded. Only the latest sent version can be accepted.

Send Quote is on the opportunity header. It refuses when the discount is over 15 percent and nobody has approved that percent, when the opportunity has no products, or when a line asks for more than the free stock at the warehouses that serve the restaurant. The refusal names the product, how many are free, and how many the quote wants. Substitute that product or lower the quantity. Do not raise the discount to hide a shortage.

North Fork Grill is the example. Adding 24 jugs of fryer oil warns that only 6 are free at Newark dry goods. Canola is the same family and has free stock there. Substituting it requires the buyer to have agreed. A different family is refused.

A quote is good for 14 days. Accept it with the buyer contact and their PO number. An older version, a declined quote, and an expired quote cannot be accepted. Convert an accepted quote into an order on one of the restaurant's delivery dates. The account cannot be on credit hold, still onboarding, or over its available credit. The new order takes the lines, reserves what is free, backorders the rest, and the deal moves to Closed Won.

Harbor Diner is still the deal at 20 percent with no sent quote. Send Quote stays off there until the discount comes down to 15 or Shail approves the exception. That empty quote list is the check.
`),
    page("quote-to-order.md", "Quote to order", "howto", "sales", sales, "Orders", `
Turning a quote into an order is the last step of the deal, and it has a required order.

The opportunity holds the working lines and the discount. Send Quote writes a version. The buyer accepts the latest version. Convert to order picks a delivery date on the territory's days and creates the order, the order lines, and the stock reservation.

Northeast days are Tuesday and Friday. Southeast days are Monday and Thursday. Midwest is Wednesday. West is Thursday. A date off that list is refused, and the page offers the next real dates.

If free stock covers the line, the quantity is allocated and the order is open. If it does not, the remainder is backordered and the order status is backordered. Converting does not silently drop a line.

The deal's stage becomes Closed Won. The quote status becomes converted and points at the new order. An account on credit hold, like Juniper Deli, cannot receive that order until the hold is released.
`),
    page("payment-plans.md", "Payment plans", "policy", "finance", finance, "Invoices", `
A payment plan splits one invoice balance into equal installments, every 14 days from a first date inside the next 30 days. An invoice can have only one plan that is pending or active.

Sparsh can propose the plan. He cannot record the payment. Finance posts payments, and in this company that is Krishna Das. The screen says so.

A plan over $1,000, or a plan with more than 3 installments, waits for Krishna. A smaller, shorter plan becomes active at once. Juniper Deli's invoice-17 is $1,840 and past due, so a 4-installment plan goes to Krishna.

The first installment has to be paid before anyone can release the credit hold. Paying the whole balance marks the invoice paid and the plan completed. A payment larger than the balance is refused.
`),
    page("credit-hold-release.md", "Releasing a credit hold", "howto", "finance", finance, "Accounts", `
A credit hold lands when an invoice is still open 30 days after its due date. It blocks a new order. It does not change the 15 percent discount cap, and it does not turn Send Quote on or off. Harbor Diner is not on hold. Juniper Deli is.

Juniper's invoice-17 was due 2026-09-15 and is still open for $1,840. The account page says the hold reason: invoice-17 is past due. Order-18, for $640, is already held for the same reason.

Sparsh logs the collections call, proposes a payment plan, and asks Krishna to release the hold. The release is refused while any past-due invoice is neither paid nor covered by an active plan whose first installment is paid. Krishna approves the plan, records the first payment, and then approves the release.

Releasing the hold does not by itself ship the held order. Release the order next. It reserves stock and becomes open, or backordered if the warehouse is short. Shail does not place or clear a hold.
`),
    page("reorder-and-receiving.md", "Reorder and receiving", "howto", "warehouse", ops, "Purchase Orders", `
Supply shows a row as below its reorder point when free stock is under that point. Fryer oil at Newark dry goods is the example: 24 on hand, reorder point 40, reorder quantity 60, and 18 of the 24 already allocated to River Salt's open order. Cedar Spoon has 12 more jugs backordered on order-20. Free stock is 6.

Reorder starts a draft purchase order to the product's supplier, Harbor Mills, at that warehouse. The suggested quantity covers the reorder quantity plus what is backordered. A second draft for the same supplier and warehouse is refused. The first draft's id is the place to add lines.

Harbor Mills has a $500 minimum. The fryer-oil draft alone is under it, so submit is refused until another Harbor Mills product, such as olive oil, brings the total to $500. A line from a different supplier does not belong on that purchase order. Oil does not go to Jersey City cold. That building receives dairy only. Newark dry goods and Chicago dry receive dry goods, paper, oil, and smallwares.

Submit sends a purchase order over $5,000 to Krishna. Under $5,000 it is approved at once. Then send it. The expected date is today plus the supplier's lead time. Receive it line by line. Stock on hand rises by what was counted on the dock, and the purchase order becomes partially received or received. Receiving more than the line still needs is refused.

Release backorders after stock is in. Waiting lines fill oldest first. An order with nothing left backordered becomes open.

Sparsh can open the purchase order and read it. Every warehouse button tells him that account executives do not receive. Krishna, standing in for ops and the warehouse, does the reorder, the submit, the receive, and the backorder release.
`),
    page("onboarding-checklist.md", "Onboarding checklist", "howto", "sales", sales, "Accounts", `
A new restaurant starts in onboarding, not active. Orders are refused until the checklist is done, and the refusal says the restaurant is still onboarding.

Create the account with a name and a ZIP. The territory and warehouse come from the ZIP prefix. Northeast is 07, 08, 10, 11, and 12, served from the Jersey City office. Southeast is 27 through 33. Midwest is 46, 53, 60, and 61. West is 90, 91, 94, and 98. A ZIP no territory covers is refused. A warehouse in another office cannot be saved onto the account.

The checklist, in order, is the buyer contact, an accounts-payable contact with an email, the territory and warehouse confirmed, the price book, the delivery days, the tax status, and an approved credit limit.

A Northeast restaurant uses the Northeast price book. Any other territory uses Standard. Delivery days have to be days that territory already runs. Taxable needs nothing more. Exempt needs a certificate number and an expiry in the future.

Credit of $2,500 or less is approved at once. More than that becomes an approval for Krishna, and he can approve a lower limit than the one requested. Applying for credit before the accounts-payable contact has an email is refused.

Activate is refused while any item is open, and the message names the first open item. After activation, a new order still cannot exceed the available credit.
`),
    page("backorders.md", "Backorders", "howto", "ops", ops, "Orders", `
A backorder is the part of an order line the warehouse could not allocate. The order stays backordered until those units are filled or the buyer changes the order.

Cedar Spoon's order-20 is 12 jugs of fryer oil, all backordered, because Newark has only 6 free after River Salt's open order. Converting a quote that asks for more than free stock creates the same split: allocated up to what is free, the rest backordered.

Receiving a purchase order raises on-hand. Release backorders then moves that free stock onto the oldest waiting lines at that warehouse. When a line's backordered quantity hits zero and the order has no other backordered lines, the order becomes open.

A held order, such as Juniper Deli's order-18, is not a backorder. The hold is credit. Release the hold first, then the order reserves stock and may still come out backordered if the warehouse is short.
`),
    page("available-credit.md", "Available credit", "policy", "finance", finance, "Accounts", `
Available credit is the credit limit minus the open invoice balance minus the orders that are open, held, backordered, or picking and do not have an invoice yet.

Every active restaurant in the seed starts with a $5,000 limit, net 30, and taxable status. A new restaurant has no limit until the credit application is approved. Onboarding accounts cannot order at all.

An order over the available credit is refused, and the message says by how many dollars. A credit memo and a payment both give credit back, because they lower the open balance. A hold is separate: Juniper Deli can have available dollars and still be blocked because invoice-17 is past due.

The account page shows the limit, the open balance, the available credit, and the aging buckets: current, 1 to 30, 31 to 60, 61 to 90, and over 90.
`),
  ];
}
