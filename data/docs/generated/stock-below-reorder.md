# Stock below the reorder point

Kind: inventory
Department: warehouse
Roles: account executive, warehouse, owner
Module: Inventory

A row is below its reorder point when on hand is under that point. Free stock is lower still once open orders have allocated some of it. Reorder from Supply. The draft goes to the product's supplier, at that warehouse, and has to clear the supplier minimum before submit.

Rows under the point: Napkins at Jersey City cold has 20 on hand and reorders at 30. Fryer oil at Newark dry goods has 24 on hand and reorders at 40. Gloves at Newark dry goods has 28 on hand and reorders at 30. Crushed tomatoes at Jersey City cold has 20 on hand and reorders at 30. Kitchen towels at Chicago dry has 24 on hand and reorders at 30. Aluminum foil at Newark dry goods has 28 on hand and reorders at 30. Y peeler at Jersey City cold has 20 on hand and reorders at 30. Chef knife at Chicago dry has 24 on hand and reorders at 30. Canola oil at Newark dry goods has 28 on hand and reorders at 30.

Fryer oil at Newark dry goods is the demo row: 24 on hand, reorder point 40, with 18 allocated to River Salt and 12 backordered for Cedar Spoon, so 6 are free. Account executives do not receive the purchase order that refills it.
