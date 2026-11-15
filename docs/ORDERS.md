# Orders after checkout (Phase 9)

Online orders are confirmed by phone, edited if the customer changes their
mind, packed by scanning, handed to a courier (typed in by hand until Phase 11)
and settled when the courier pays the cash it collected.

## States

```
PENDING ──confirm──▶ CONFIRMED ──start packing──▶ PROCESSING ──ship──▶ SHIPPED ──▶ DELIVERED
   │                    │  ▲                         │                   │
   │                    │  └──────── unpack ─────────┘                   ▼
   └──────── cancel ────┴────────── cancel ──────────┘            DELIVERY_FAILED
                                                                  │        │
                                                   ship again ◀───┘        ▼
                                                               RETURNED_TO_WAREHOUSE
```

| Step                                       | Permission            | Stock                                        | Money / documents                             |
| ------------------------------------------ | --------------------- | -------------------------------------------- | --------------------------------------------- |
| Confirm (or a call "answered — confirmed") | `order.confirm`       | —                                            | —                                             |
| Edit (PENDING, CONFIRMED)                  | `order.edit`          | reserve / release the difference             | totals recalculated, coupon re-checked        |
| Move location (same)                       | `order.edit`          | release at old, reserve at new               | —                                             |
| Cancel (until PROCESSING)                  | `order.cancel`        | release everything                           | coupon use returned; reason required          |
| Start packing / unpack                     | `order.fulfil`        | —                                            | packing slip                                  |
| Packing complete                           | `order.fulfil`        | —                                            | counts must match the order exactly           |
| Ship                                       | `order.fulfil`        | RELEASE + SALE_ONLINE (from the reservation) | `Shipment` (MANUAL), invoice `INV-YYMM-NNNNN` |
| Delivered                                  | `order.fulfil`        | —                                            | COD stays UNPAID                              |
| Delivery failed                            | `order.fulfil`        | — (parcel is with the courier)               | reason required                               |
| Back in warehouse                          | `order.fulfil`        | RETURN (+ DAMAGE for damaged units)          | lost delivery charge recorded                 |
| Courier cash                               | `order.cod.reconcile` | —                                            | PAID when the order's amount arrived in full  |

In-store sales are created DELIVERED and never move. `RETURNED` is a legacy
value nothing uses; returns after delivery leave the order DELIVERED.

## Transactions and locks

Every change runs in one `runInventoryTransaction`, and locks in this order
(each group sorted by id): Order rows `FOR UPDATE` → Coupon `FOR UPDATE` →
InventoryLevel rows. The status and the form's `version` are checked on the
locked row, so of two simultaneous confirm/cancel clicks exactly one wins and
an edit form opened earlier is refused. Checkout never locks an existing order,
so it cannot wait on these in a cycle. Bulk shipping runs each order in its own
transaction and lists the ones that failed with the reason.

## Calls

Each call is logged with its result. No-answer and switched-off calls count
towards "unreachable" only when at least `orders.callRetryMinHours` (2) apart;
after `orders.unreachableAfterAttempts` (3) the order is flagged. It is never
cancelled automatically. A fake order can block the phone in the same step
(`customer.block`).

## Edits

Lines already on the order keep the price the customer was quoted; a variant
new to the order (another size or colour included) takes today's price. The
coupon is judged as at placement (usage limits and dates ignored) against the
new basket; if its scope or minimum is no longer met it is removed and its use
returned. The delivery charge follows the zone's current rate. If the total
changes, staff are reminded to tell the customer. After packing, only the
address can be corrected; prices stay, and an existing invoice gets a new
version with the same number.

## Invoices

The number is taken when the goods leave (SHIPPED, or the till sale), so a
cancelled order never uses one. `Invoice.snapshot` holds exactly what is
printed (shop details from settings at that moment). One current version per
order (partial unique index); earlier versions are kept.

## Courier cash

Choose a courier's delivered, unpaid COD orders and enter what arrived and the
charges the courier kept. An order paid in full becomes PAID; one paid short
stays UNPAID with what arrived added to `paidPoisha`. The settlement keeps
`difference = received + charge − expected`; a non-zero difference is shown in
red. An order can be in one settlement only.

## Pages

| Page                                             | Permission                                           |
| ------------------------------------------------ | ---------------------------------------------------- |
| `/admin/orders`, `/admin/orders/[id]`            | `order.read` (+ the action's own)                    |
| `/admin/orders/[id]/edit`                        | `order.edit`                                         |
| `/admin/orders/[id]/pack`                        | `order.fulfil`                                       |
| `/admin/orders/cod`                              | `order.cod.reconcile`                                |
| `/admin/customers`, `/admin/customers/[orderId]` | `order.read` (full phone and notes: `customer.read`) |
| `/admin/print/orders/packing-slips?ids=`         | `invoice.print`                                      |

Staff see only orders of the locations they may access. Phones are masked
without `customer.read`, and searching by phone or name needs it too. A
customer page is reached through one of their orders, so a phone number never
appears in a URL.

## Settings

`orders.unreachableAfterAttempts`, `orders.callRetryMinHours`,
`orders.couriers` (comma-separated: STEADFAST, PATHAO, REDX, MANUAL, OTHER),
`orders.packingSlipSize` (A4 or A5), and the shop details printed on invoices:
`store.nameEn/nameBn/addressEn/addressBn/contactPhone/logoUrl`, `vat.enabled`,
`vat.ratePercent`, `vat.bin`, `vat.showBreakdown`.
