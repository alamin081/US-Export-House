# Inventory (Phase 7)

Branches and warehouses, stock per location, the stock ledger, receiving and
CSV import, adjustments, transfers, stock counts, and what the storefront shows.

## Data model

| Table                                | Purpose                                                                                                                                                        |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Location`                           | Branch or warehouse. `code` (capitals, `WH-01`), names, division / district / thana / street, `isOnlineFulfillment`, `isDefaultOnlineFulfillment`, `isSample`. |
| `InventoryLevel`                     | One row per variant × location: `onHand`, `reserved`, optional `lowStockThreshold`. `available = onHand − reserved` is never stored.                           |
| `InventoryMovement`                  | Append-only ledger. Signed `quantity`, `reasonCode`, `reason`, `onHandAfter` / `reservedAfter`, `unitCostPoisha`, loose reference, user, time.                 |
| `StockReceipt`                       | One receive or CSV import (`RCV-2026-0001`): kind OPENING / PURCHASE, source MANUAL / CSV, supplier challan, file name and SHA-256.                            |
| `StockTransfer`, `StockTransferItem` | `TRF-2026-0001`. DRAFT → (APPROVED) → DISPATCHED → RECEIVED, or CANCELLED. Sent vs received per line, discrepancy reason.                                      |
| `StockCount`, `StockCountItem`       | `CNT-2026-0001`. IN_PROGRESS → SUBMITTED → APPLIED, or CANCELLED. Snapshot, counted, movements since the snapshot, difference.                                 |

Database guard rails: stock never negative and never `reserved > onHand`
(CHECK), one default online location which must be online and active (partial
unique index + CHECK), location code format (CHECK), one open count per
location (partial unique index), `onHandAfter` / cost never negative.

## The ledger

Every stock change goes through `InventoryUnitOfWork.applyMovements`
(`inventory.repository.ts`), which runs a conditional UPDATE and appends the
ledger row in the same transaction. Nothing else writes `InventoryLevel`.

```
onHand   = Σ quantity of every movement except RESERVE / RELEASE
reserved = Σ quantity of RESERVE / RELEASE movements
```

`npm run inventory:verify` (read-only) checks this for every row, plus ledger
rows without a stock row and transfer totals. CI runs it after the
integration tests.

| Type                         | Sign | Written by                                                  |
| ---------------------------- | ---- | ----------------------------------------------------------- |
| `OPENING`                    | +    | Opening stock (receive screen or CSV), no earlier history   |
| `PURCHASE_RECEIVE`           | +    | Stock receive (receive screen or CSV)                       |
| `ADJUSTMENT_IN` / `_OUT`     | ±    | Found, correction, other                                    |
| `DAMAGE`                     | −    | Damaged                                                     |
| `TRANSFER_OUT`               | −    | Dispatch, at the source                                     |
| `TRANSFER_IN`                | +    | Receive, at the destination (the quantity sent)             |
| `TRANSFER_DISCREPANCY`       | ±    | Receive, at the destination: received − sent, with a reason |
| `COUNT_CORRECTION`           | ±    | Applying a stock count                                      |
| `RESERVE` / `RELEASE`        | ±    | Orders (Phase 8); change `reserved`                         |
| `SALE_ONLINE` / `SALE_STORE` | −    | `commitSale` (Phase 8–9), after a RELEASE when reserved     |
| `RETURN`                     | +    | Returns (Phase 9)                                           |
| `ADJUSTMENT` (deprecated)    |      | Never written; kept because enum values are not dropped     |

## Concurrency

- Single rule for every change: `reserved + Δreserved ≥ 0` and
  `(onHand + ΔonHand) − (reserved + Δreserved) ≥ 0`, checked in the UPDATE's
  WHERE clause. READ COMMITTED re-checks it after waiting for a row lock, so
  simultaneous sales cannot oversell (50 parallel reservations on 10 units:
  exactly 10 succeed — integration test).
- Lock order inside every transaction: the document row (transfer or count)
  → ProductVariant rows (only when the cost changes) → InventoryLevel rows
  sorted by `(variantId, locationId)`. Missing stock rows are inserted in the
  same order first. No cycle is possible, so opposite transfers cannot
  deadlock (integration test).
- `SET LOCAL lock_timeout = '5s'`; a deadlock or serialization failure is
  retried up to 3 times. Code inside a transaction never reads through the
  shared client (a second pooled connection could starve the pool).
- All lines of a multi-line operation are checked before anything is written;
  a shortage on any line rolls everything back with a message naming each
  SKU, location and shortfall.

## Service functions (`src/modules/inventory`)

| Function                                                                                        | File                     | Notes                                                       |
| ----------------------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------- |
| `receive`, `previewImport`, `applyImport`                                                       | `inventory.service.ts`   | `inventory.receive`; weighted average cost                  |
| `adjust`, `setLowStockThreshold`                                                                | `inventory.service.ts`   | `inventory.adjust`; > 20 units needs confirmation (setting) |
| `reserve`, `release`, `commitSale`                                                              | `inventory.service.ts`   | Ready for Phase 8–9; staff actor or system actor            |
| `getAvailability`, `getProductStockStatus`                                                      | `inventory.service.ts`   | Location or online; storefront gets in / few / out only     |
| `getMatrix`, `exportMatrixCsv`, `getVariantStock`, `getLowStock`                                | `inventory.service.ts`   | Location-scoped; cost only with `inventory.cost.read`       |
| `saveTransferDraft`, `approveTransfer`, `transferDispatch`, `transferReceive`, `cancelTransfer` | `transfer.service.ts`    | Source dispatches, destination receives                     |
| `startCount`, `recordCount`, `submitCount`, `applyCount`, `cancelCount`                         | `stock-count.service.ts` | `applyCount` needs `inventory.count.apply`                  |
| `saveLocationForStaff`, `deleteLocationForStaff`                                                | `location.service.ts`    | `location.manage`                                           |

Every function checks permission and location access itself.

## Rules agreed with the owner (2026-11-14)

- **Online stock** = available at every active location with
  `isOnlineFulfillment`. Online orders ship from the default online location
  (choosing another location per order is Phase 9).
- **Opening stock** only for a variant with no ledger history at that
  location; otherwise use Stock receive.
- **Transfers**: the source's staff dispatch, the destination's staff receive.
  Optional approval step (setting `transfer.requireApproval`, default off). A
  dispatched transfer cannot be cancelled: nothing arrived = receive 0 with
  reason Lost; goods going back = a new transfer the other way. Short lines
  need a reason (lost, damaged, wrong item); over-receipt is recorded as
  EXCESS with a "count the sending location" warning.
- **Stock in transit** (DISPATCHED) counts towards no location.
- **Counts**: one open count per location. Correction = counted − (snapshot +
  movements between the snapshot and the moment that line was counted).
  Uncounted lines stay unchanged unless a holder of `inventory.count.apply`
  ticks "set uncounted to 0" and confirms; only lines of that count's scope.
- **Cost**: weighted average over everything owned (all locations + in
  transit), updated on each costed receipt. Cost is entered on receipts but
  only shown to `inventory.cost.read`.
- **CSV duplicates** (same location + SKU) are added together; the preview
  names the rows. The same file twice (by SHA-256) needs an explicit tick.
- **Low stock**: admin threshold per stock row, otherwise
  `inventory.lowStockDefaultThreshold` (5). Storefront "only a few left" at or
  below `storefront.fewLeftThreshold` (3).

## CSV import

Columns `location_code, sku, quantity, unit_cost_tk` (cost optional; extra
columns ignored). Accepted: UTF-8 BOM, comma / semicolon / tab, blank rows,
spaces, SKU in any case, Bengali digits, `৳` / `Tk` before a cost, thousands
separators inside quotes (`"1,250.50"`). An unquoted thousands comma in a
comma-separated file breaks the columns and is reported as such. Limits:
`inventory.import.maxRows` (5,000) and `inventory.import.maxBytes` (2 MB).
Preview saves nothing; apply is one transaction (all or nothing).

## Storefront caching

- Product pages stay ISR (1 hour, catalogue tags). Stock changes **never**
  rebuild them.
- The purchase panel fetches `/api/storefront/products/[slug]/availability`
  (in / few / out per variant, never numbers). Server cache: tag
  `stock:online`, 30 s; HTTP: `public, s-maxage=30, stale-while-revalidate=60`
  for a CDN; the browser fetches with `no-store`.
- Shop and category pages are rendered per request; their "out of stock"
  labels come from a 60 s cache (tag `stock:online`), and "in stock only"
  listings use a separate 30 s cache entry.
- Home rows and related products, and the structured-data availability, are
  taken when the hourly catalogue cache is built (may lag up to an hour).
- Admin stock actions update only the `stock:online` tag.
- Checkout will always re-check real stock in `reserve` (Phase 8): a stale
  label can never cause an oversell.

## Scripts

| Command                                 | What it does                                                            |
| --------------------------------------- | ----------------------------------------------------------------------- |
| `npm run inventory:verify`              | Read-only ledger check; exit 1 on any mismatch                          |
| `npm run db:mark-sample [-- --confirm]` | Local only: flag the four seed locations as sample (dry run by default) |
