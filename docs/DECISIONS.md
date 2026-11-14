# Decision log

Decisions made by the owner, with the date and where they take effect. Newest
first. Open questions stay in the master plan until they are answered here.

| Date       | Decision                                                                                                                              | Takes effect |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 2026-11-14 | SKU format `UEH-{CATEGORY_CODE}{4 digits}-{COLOUR}-{SIZE}`, capital letters/digits/hyphens only; existing SKUs unchanged.             | Phase 6      |
| 2026-11-14 | Digits: setting `storefront.numerals`, default `latin`.                                                                               | Phase 6      |
| 2026-11-14 | One English slug for both languages; no `slugBn` column.                                                                              | Phase 6      |
| 2026-11-14 | Content Editor: drafts + names, descriptions, SEO, alt text. No prices, variants, publishing or category tree.                        | Phase 6      |
| 2026-11-14 | Images: direct signed Cloudinary upload, 8 MB limit, browser resizes to 2400 px, server verifies after upload.                        | Phase 6      |
| 2026-11-14 | Fits (setting): Slim, Regular, Relaxed, Oversized, Comfort, in English and Bengali.                                                   | Phase 6      |
| 2026-11-14 | No stock on the storefront until Phase 7; no product reviews in Phase 6.                                                              | Phase 6      |
| 2026-11-14 | Caching: previous Next.js model (tags + revalidation); Cache Components in Phase 13.                                                  | Phase 6      |
| 2026-11-14 | Playwright (Chromium only) and `radix-ui` added; existing categories unchanged, the owner builds the tree.                            | Phase 6      |
| 2026-11-14 | Option presets: sizes S–3XL, collar 15–17, waist 28–40, panjabi 38–46; nine colours with hex and 3-letter codes.                      | Phase 6      |
| 2026-11-14 | Product images are stored on **Cloudinary**, behind the `StorageProvider` interface (local mock in dev).                              | Phase 6      |
| 2026-11-14 | **Customer phone + SMS OTP sign-in** is built in **Phase 8**, together with cart and checkout.                                        | Phase 8      |
| 2026-11-14 | **Editing role permissions** from the admin is built in **Phase 12**; the matrix stays read-only until then.                          | Phase 12     |
| 2026-11-14 | Staff sessions: idle timeout 8 hours, absolute lifetime 7 days, both configurable per deployment.                                     | Phase 5      |
| 2026-11-14 | One price per variant at every location (`pricePoisha`); stock stays per location; no `LocationPrice`.                                | Phase 4      |
| 2026-11-14 | Neon for staging and production; local Docker PostgreSQL for development.                                                             | Phase 13     |
| 2026-11-06 | Latin digits in both languages; English product copy mandatory, Bengali optional with English fallback; order numbers `UEH-2026-001`. | Phase 3      |
