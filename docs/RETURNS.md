# Returns, exchanges, refunds and invoices (Phase 9)

## Requests

- **Customer:** on `/track-order`, after the order number and phone match, a
  delivered online order inside the window (`returns.windowDays`, 7) shows a
  form: items and quantities, return or exchange (another size/colour of the
  same product that is in stock online), reason, optional photos
  (`returns.maxPhotos`, checked like product images, stored in `returns/`).
  A signed 30-minute token proves the lookup; the phone and window are checked
  again on submit; `returns.requestsPer15Min` tries per IP.
- **Staff:** "Start a return or exchange" on a delivered order
  (`return.manage`). Outside the window it needs a written reason.
- A unit can be in one open request only.

## Steps

`REQUESTED → APPROVED → RECEIVED → INSPECTED → COMPLETED` (shown as "Closed"),
or `REJECTED` with a reason (only before approval).

| Step    | What happens                                                                                              |
| ------- | --------------------------------------------------------------------------------------------------------- |
| Approve | every unit is valued; an exchange gets its replacement order now                                          |
| Receive | the parcel is back                                                                                        |
| Inspect | per item: ACCEPTED → `RETURN` into the chosen location; DAMAGED → `RETURN` + `DAMAGE`; REJECTED → nothing |
| Refund  | `refund.record`, amount computed (see below)                                                              |
| Close   | only when nothing is owed and no refund waits for approval                                                |

Lock order: original Order → ReturnRequest → Refund → stock rows.

## Money

A returned unit is worth its price minus its line's share of the order
discount. Partial returns are valued cumulatively so a line returned in parts
adds up exactly:
`credit = floor(net × (done + k) / qty) − floor(net × done / qty)`, `net = line total − line discount`.

Example: shirt ৳1,500 × 2 and pant ৳2,000 with a 10% coupon (shirt line ৳300,
pant ৳200 of discount), delivery ৳70. One shirt back (size): ৳1,350. Defective
pant: ৳1,800 + ৳70 delivery = ৳1,870.

- Delivery is refunded only for a defective or wrong item
  (`returns.refundShippingOnFault`), and only once per order.
- Methods: bKash, Nagad, bank transfer (reference required), cash.
- Above `refund.approvalAbovePoisha` (৳5,000) a refund is PENDING until someone
  with `refund.approve` approves it (`/admin/refunds`). A recorder who holds
  `refund.approve` completes it directly.
- Completed refunds add to `Order.refundedPoisha`; the payment becomes
  PARTIALLY_REFUNDED or REFUNDED. A refund can never exceed what was collected
  (`paidPoisha`): the service refuses it and the `Order_refunded_lte_paid` CHECK
  would too. An unsettled COD order cannot be refunded until the courier's cash
  is recorded.

## Exchanges

The replacement is a new order linked to the original (`exchangeOfOrderId`),
CONFIRMED with its stock reserved, at the default online location (in-store
orders: the same branch).

- The same product in another size or colour costs what the customer already
  paid for it (original price, same discount share). A different product takes
  today's price.
- The returned units' credit pays the new order (`EXCHANGE_CREDIT` payment).
  Anything still due is cash on delivery; credit left over is refunded on the
  original order after inspection.
- Delivery: `returns.exchangeShippingPaidBy` (CUSTOMER); free on the shop's
  fault.
- It may ship before the old item is back, with a warning and a required note.

Examples: shirt M (credit ৳1,350) → shirt L: pays ৳70 delivery only. Shirt M →
a ৳1,800 shirt, defective: pays ৳450, no delivery.

## Invoices and printouts

| Printout       | Where                                               | Notes                                          |
| -------------- | --------------------------------------------------- | ---------------------------------------------- |
| Invoice (A4)   | `/admin/print/orders/[id]/invoice?v=&lang=bn\|en`   | the stored snapshot; PDF from the print dialog |
| Packing slip   | `/admin/print/orders/packing-slips?ids=`            | no prices; order barcode; A4/A5 setting        |
| Address labels | `/admin/print/orders/address-labels?ids=[&size=a6]` | 4 per A4, or 100×150 mm thermal                |

Invoices: shop name, address, phone and logo from the checkout settings page
("Shop details on invoices"); "all prices include VAT"; the BIN and the VAT
share print only when `vat.enabled` (and `vat.showBreakdown`) are switched on.

## Return policy

`/admin/returns/policy` (`return.policy.publish`): approve and publish, or take
down. Until published, checkout and tracking do not link to it and the page is
not indexed. Each change is audited.
