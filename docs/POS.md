# Shop till (POS) and barcode labels (Phase 9)

## Days and counters

A till day belongs to one counter of one location (`PosSession`, reference
`DAY-YYMM-NNNNN`). Every location has the counter MAIN; more come from
`pos.counters` (JSON, e.g. `{"BR-GUL": ["2"]}`). Only one open day per counter
(partial unique index).

- **Open** (`pos.day.manage`): count the opening cash (float).
- **Close** (`pos.day.manage`): count the drawer. Expected cash = float + cash
  kept from sales (handed over − change) − cash refunded from this drawer. A
  difference needs a reason. The Z-report is frozen on the day.
- **After closing**, nothing about the day's bills can change. The service
  refuses it, and database triggers (`pos_guard_*`) refuse any change to the
  money, lines, status or day of its sales and payments, and any new sale,
  payment or refund on the day. A refund of an old bill goes on today's day.

## Selling

Staff sell only at locations they may access (`pos.sell`). Items are added by
USB scanner (barcode or SKU, Enter) or search. The available stock at that
location is shown.

- **Discounts:** per line or on the bill, % or taka.
  - Each role has a limit (`pos.maxDiscountPercentByRole`: Branch Sales Staff
    5%, Branch Manager 15%, others unlimited), measured on typed discounts.
  - Above the limit, a manager with `pos.discount.override` and access to the
    shop approves with their email and till PIN (set on My account). Wrong
    tries are limited by `pos.pinAttemptsPer15Min`, and the approver is
    recorded on the sale.
- **Coupons:** only coupons for the channel STORE or BOTH apply.
- **Customer phone:** optional. When given, the sale shows in the customer view
  next to online orders.
- **Payment:**
  - Cash, card, bKash or Nagad, split across several methods. The parts must
    equal the bill.
  - Cash may be over-paid; the change is shown and recorded.
  - Card, bKash and Nagad need a reference. Card is recorded only, no
    terminal integration.
- **One transaction** creates:
  - the order (STORE, DELIVERED, PAID)
  - `SALE_STORE` stock movements (straight off the shelf, no reservation)
  - the payments
  - the invoice, whose number is the bill number
- **Idempotency:** every bill carries an idempotency key, so a retry after a
  dropped connection never charges twice. Without a connection the sale is not
  completed and the screen says so.
- **Held bills:** a bill can be parked and resumed later. It holds no stock.
- **Receipt:** `/admin/print/pos/receipt/[orderId]` for 80 mm paper (58 mm via
  `pos.receiptWidthMm`), in Bengali or English.
- **Returns at the counter:**
  - Find the bill by scanning its barcode or typing the number, then use the
    normal return flow (docs/RETURNS.md).
  - A cash refund can be paid from an open day's drawer (`posSessionId` on the
    refund) and counts in that day's Z-report.
  - A counter exchange is a return followed by a new sale.

Lock order for a sale: PosSession `FOR SHARE` (closing takes `FOR UPDATE`) →
Coupon `FOR UPDATE` → InventoryLevel rows. The last piece sold at two counters
at once goes to exactly one of them.

## Barcodes and labels

- **Internal barcode:** EAN-13 in the GS1 restricted range 29, built as
  29 + `barcode_seq` + check digit. Existing barcodes are never changed.
- **New variants** get one automatically when created, unless one was typed.
- **Missing barcodes:**
  - Admin: Labels → "Generate missing barcodes" (`label.print` or
    `catalog.write`). Fills empty barcodes only and writes one audit row.
  - Script for the local database: `npm run catalog:generate-barcodes`, a dry
    run by default; add `-- --confirm` to write.
- **Labels** (`label.print`) are printed at `/admin/print/labels`. The items can
  come from:
  - `?items=variantId:qty,…`
  - `?product=` (one each)
  - `?receipt=` or `?transfer=` (the quantities received or sent)
- **Each label shows** the barcode, SKU, short name, size, colour and price.
- **Formats:** thermal labels (`labels.widthMm` × `labels.heightMm`, default
  38×25 mm), or `&sheet=a4` for a 3×8 sticker sheet. Printing uses the browser;
  no special driver is needed.

## Permissions

| Key                     | Who (system roles)                           |
| ----------------------- | -------------------------------------------- |
| `pos.sell`              | Branch Sales Staff, Branch Manager, managers |
| `pos.discount.override` | Branch Manager, Store Manager, Super Admin   |
| `pos.day.manage`        | Branch Manager, Store Manager, Super Admin   |
| `label.print`           | Branch staff, Inventory Staff, managers      |
