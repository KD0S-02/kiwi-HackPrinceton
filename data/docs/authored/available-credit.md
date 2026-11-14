# Available credit

Available credit is the credit limit minus the open invoice balance minus the orders that are open, held, backordered, or picking and do not have an invoice yet.

Every active restaurant in the seed starts with a $5,000 limit, net 30, and taxable status. A new restaurant has no limit until the credit application is approved. Onboarding accounts cannot order at all.

An order over the available credit is refused, and the message says by how many dollars. A credit memo and a payment both give credit back, because they lower the open balance. A hold is separate: Juniper Deli can have available dollars and still be blocked because invoice-17 is past due.

The account page shows the limit, the open balance, the available credit, and the aging buckets: current, 1 to 30, 31 to 60, 61 to 90, and over 90.
