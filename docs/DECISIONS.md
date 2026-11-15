# Decision log

Decisions made by the owner, with the date and where they take effect. Newest
first. Open questions stay in the master plan until they are answered here.

| Date       | Decision                                                                                                                                                                | Takes effect |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 2026-11-15 | Invoice numbers (`INV-YYMM-NNNNN`) are taken at **SHIPPED** (online, same transaction as the sale) or at the till sale; corrections add a version with the same number. | Phase 9      |
| 2026-11-15 | Order edits: lines already on the order keep their price; new or changed variants take today's price; the coupon is re-checked as at placement and dropped if unmet.    | Phase 9      |
| 2026-11-15 | Cancelling an order returns its coupon use. Unreachable customers are flagged after 3 counted calls (2 h apart), never auto-cancelled.                                  | Phase 9      |
| 2026-11-15 | Couriers are typed in by hand (`Shipment`, mode MANUAL) until Phase 11; a COD order stays UNPAID until the courier's cash is recorded.                                  | Phase 9      |
| 2026-11-15 | Permissions: `order.process` split into `order.confirm` / `order.edit` / `order.fulfil`; `order.refund` renamed `refund.record`; new till, label and refund keys.       | Phase 9      |
| 2026-11-15 | VAT not charged on top (`vat.enabled=false`); invoices say prices include VAT; BIN and VAT share can be switched on in settings.                                        | Phase 9      |
| 2026-11-15 | Barcodes: EAN-13 in the internal range 29; generated for new variants and by an admin action / script for missing ones — never by a migration.                          | Phase 9      |
| 2026-11-15 | Refunds above ৳5,000 need approval; till discount caps: Branch Sales Staff 5%, Branch Manager 15%, managers unlimited; one counter (MAIN) per location.                 | Phase 9      |
| 2026-11-14 | Inventory: online stock = online-fulfilment locations; ships from the default online location; locations created in the admin, not seeded.                              | Phase 7      |
| 2026-11-14 | Opening stock by CSV (`location_code, sku, quantity, unit_cost_tk`); OPENING only for a variant with no history at that location.                                       | Phase 7      |
| 2026-11-14 | Transfers: source dispatches, destination receives; approval optional (off); no cancel after dispatch; excess = EXCESS discrepancy.                                     | Phase 7      |
| 2026-11-14 | Counts: one open per location; uncounted unchanged unless zeroed with `inventory.count.apply` + confirmation.                                                           | Phase 7      |
| 2026-11-14 | Cost: weighted average; shown only with `inventory.cost.read`. Branch Manager cannot receive (goods arrive at the warehouse first).                                     | Phase 7      |
| 2026-11-14 | Low stock: admin default 5 (unchanged); storefront “only a few left” at ≤ 3; large adjustment confirmation above 20 units.                                              | Phase 7      |
| 2026-11-14 | `fulfillment.defaultLocationCode` deprecated (row kept, unused); the `isDefaultOnlineFulfillment` flag is the source of truth.                                          | Phase 7      |
| 2026-11-15 | Images on Cloudinary in local, staging and production (ueh/dev, ueh/staging, ueh/prod); the mock store is for automated tests only. Old dev mock uploads deleted.       | Phase 7      |
| 2026-11-14 | Waist presets gain the odd sizes 29, 31 and 33 (34 and 36 already existed).                                                                                             | Phase 7      |
| 2026-11-14 | SKU format `UEH-{CATEGORY_CODE}{4 digits}-{COLOUR}-{SIZE}`, capital letters/digits/hyphens only; existing SKUs unchanged.                                               | Phase 6      |
| 2026-11-14 | Digits: setting `storefront.numerals`, default `latin`.                                                                                                                 | Phase 6      |
| 2026-11-14 | One English slug for both languages; no `slugBn` column.                                                                                                                | Phase 6      |
| 2026-11-14 | Content Editor: drafts + names, descriptions, SEO, alt text. No prices, variants, publishing or category tree.                                                          | Phase 6      |
| 2026-11-14 | Images: direct signed Cloudinary upload, 8 MB limit, browser resizes to 2400 px, server verifies after upload.                                                          | Phase 6      |
| 2026-11-14 | Fits (setting): Slim, Regular, Relaxed, Oversized, Comfort, in English and Bengali.                                                                                     | Phase 6      |
| 2026-11-14 | No stock on the storefront until Phase 7; no product reviews in Phase 6.                                                                                                | Phase 6      |
| 2026-11-14 | Caching: previous Next.js model (tags + revalidation); Cache Components in Phase 13.                                                                                    | Phase 6      |
| 2026-11-14 | Playwright (Chromium only) and `radix-ui` added; existing categories unchanged, the owner builds the tree.                                                              | Phase 6      |
| 2026-11-14 | Option presets: sizes S–3XL, collar 15–17, waist 28–40, panjabi 38–46; nine colours with hex and 3-letter codes.                                                        | Phase 6      |
| 2026-11-14 | Product images are stored on **Cloudinary**, behind the `StorageProvider` interface (local mock in dev).                                                                | Phase 6      |
| 2026-11-14 | **Customer phone + SMS OTP sign-in** is built in **Phase 8**, together with cart and checkout.                                                                          | Phase 8      |
| 2026-11-14 | **Editing role permissions** from the admin is built in **Phase 12**; the matrix stays read-only until then.                                                            | Phase 12     |
| 2026-11-14 | Staff sessions: idle timeout 8 hours, absolute lifetime 7 days, both configurable per deployment.                                                                       | Phase 5      |
| 2026-11-14 | One price per variant at every location (`pricePoisha`); stock stays per location; no `LocationPrice`.                                                                  | Phase 4      |
| 2026-11-14 | Neon for staging and production; local Docker PostgreSQL for development.                                                                                               | Phase 13     |
| 2026-11-06 | Latin digits in both languages; English product copy mandatory, Bengali optional with English fallback; order numbers `UEH-2026-001`.                                   | Phase 3      |
