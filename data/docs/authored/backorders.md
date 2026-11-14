# Backorders

A backorder is the part of an order line the warehouse could not allocate. The order stays backordered until those units are filled or the buyer changes the order.

Cedar Spoon's order-20 is 12 jugs of fryer oil, all backordered, because Newark has only 6 free after River Salt's open order. Converting a quote that asks for more than free stock creates the same split: allocated up to what is free, the rest backordered.

Receiving a purchase order raises on-hand. Release backorders then moves that free stock onto the oldest waiting lines at that warehouse. When a line's backordered quantity hits zero and the order has no other backordered lines, the order becomes open.

A held order, such as Juniper Deli's order-18, is not a backorder. The hold is credit. Release the hold first, then the order reserves stock and may still come out backordered if the warehouse is short.
