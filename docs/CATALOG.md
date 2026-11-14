# Catalogue (Phase 6)

Products, categories, brands, options and variants, images, size charts, and
the storefront pages that read them.

## Data model

| Table                          | Purpose                                                                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `Category`                     | Tree via `parentId`, max depth = setting `catalog.maxCategoryDepth` (default 3). `code` (2–4 letters) feeds product codes.                 |
| `Brand`                        | Name, slug, logo, description (both languages), active.                                                                                    |
| `Product`                      | Copy in both languages, `code` (`UEH-SH0012`), `fit`, SEO, `status` DRAFT → PUBLISHED → ARCHIVED, `version` (optimistic lock).             |
| `ProductCategory`              | Extra categories besides the primary one.                                                                                                  |
| `Tag`, `ProductTag`            | Search tags with alternative spellings (`aliases`), indexed as `searchText`.                                                               |
| `OptionPreset`                 | Library of sizes and colours (bilingual, hex, SKU code) offered by the matrix generator.                                                   |
| `ProductOption`, `OptionValue` | The values one product uses (copied from presets, so editing a preset never rewrites a SKU).                                               |
| `ProductVariant`               | SKU, barcode, price and compare-at price in poisha, weight, active. `optionKey` + partial unique index = one live variant per combination. |
| `ProductImage`                 | Ordered (lowest `sortOrder` = main image), alt text in both languages, optional colour, storage provider + key.                            |
| `SizeChart`                    | Size × measurement table, inches or centimetres, attached to a category or a product.                                                      |

Bilingual fields are paired columns (`nameEn` required, `nameBn` optional); the
storefront falls back to English, the admin flags the missing translation. One
English slug serves both languages.

## Rules

- **Publishing** needs a name in both languages, one image, one active variant
  and a price above zero on every active variant (`publish-rules.ts`). Bulk
  publish checks each product and reports the missing items per product.
- **Deleting**: only a draft that no order ever used can be (soft-)deleted. A
  removed variant is archived (`deletedAt`), never deleted, so order history and
  stock ledgers keep their references.
- **One transaction**: product, option values, variants and images are saved
  together (`saveProductGraph`); any failure rolls everything back.
- **Concurrent edits**: every save names the `version` it started from; a stale
  save is refused with a clear message instead of overwriting.
- **SKUs**: `{PRODUCT_CODE}-{COLOUR}-{SIZE}` (setting `catalog.skuPattern`), e.g.
  `UEH-SH0012-NVY-L`; capital letters, digits and hyphens only; editable but
  unique. Leave the field empty to generate it. Existing SKUs are never rewritten.
- **Prices** are integer poisha. Price changes are audited with old and new values.
- **Stock** is read-only here; it is managed in Phase 7 and not shown on the
  storefront until then.

## Permissions

| Key                   | Super Admin | Store Manager | Content Editor | Others |
| --------------------- | :---------: | :-----------: | :------------: | :----: |
| `catalog.read`        |      ✓      |       ✓       |       ✓        |   ✓    |
| `catalog.write`       |      ✓      |       ✓       |                |        |
| `catalog.content`     |      ✓      |       ✓       |       ✓        |        |
| `catalog.price.write` |      ✓      |       ✓       |                |        |
| `catalog.publish`     |      ✓      |       ✓       |                |        |
| `catalog.delete`      |      ✓      |       ✓       |                |        |

A Content Editor can create drafts and edit names, descriptions, fabric, care,
SEO, image alt text and tags — not prices, variants, images, publishing or the
category tree. Checks happen on the page, in the Server Action and again in
the service.

## Images

`StorageProvider` (`src/integrations/storage/`) with two implementations:

- **Cloudinary** (`STORAGE_PROVIDER=cloudinary`). The browser resizes the photo
  to at most 2400 px, asks `/api/admin/uploads/ticket` for signed upload fields
  (the API secret stays on the server), uploads straight to Cloudinary under a
  server-chosen key, then `/api/admin/uploads/complete` asks Cloudinary what was
  stored and deletes it unless it is JPEG/PNG/WebP/AVIF within the size limit
  (setting `media.maxUploadBytes`, default 8 MB). **Not yet tested against a real
  Cloudinary account.**
- **Local mock** (`STORAGE_PROVIDER=local`, development only, refused when
  `APP_ENV=production`). Files go to `public/uploads-dev/` (git-ignored) after a
  MIME + file-signature check and are served by `/api/dev-uploads/[file]`. The
  admin shows a **MOCK STORAGE** badge.

Every upload returns an HMAC token; a product save accepts a new image only
with a valid token. Removed images are deleted from storage after the database
change; a storage failure is logged and never undoes the change. Images are
shown in a 4:5 frame without cropping.

## Storefront

- Home (new and featured), `/shop` (search + filters), `/category/[slug]`
  (filters: size, colour, brand, price; sort: featured, newest, price), and
  `/product/[slug]` (gallery that follows the colour, size/colour selection with
  price and SKU, size guide). Filters live in the URL.
- Search uses PostgreSQL trigram indexes on names, product code, SKU and tag
  text (names and aliases) — Bengali, English and Banglish queries all work.
- Only published products and active categories are shown; anything else is a
  real 404.
- Caching (previous Next.js model): reads go through `unstable_cache` with tags
  (`catalog:lists`, `catalog:categories`, `catalog:product:<slug>`,
  `catalog:size-charts`, `settings`); admin actions call `updateTag`, so the
  next visit sees the change. Fallback lifetime 1 hour.
- SEO: per-locale metadata, canonical and `hreflang`, Open Graph with the main
  image, name and price (`product:price:amount`), Product + BreadcrumbList
  JSON-LD, and `sitemap.xml` with both languages.
- Digits follow the `storefront.numerals` setting (default `latin`).

## Settings (`Setting` table)

`catalog.skuPattern`, `catalog.productCodePrefix`, `catalog.maxCategoryDepth`,
`catalog.fits` (JSON, bilingual), `media.maxUploadBytes`, `media.maxImageEdgePx`,
`storefront.numerals`. A missing or malformed row falls back to the default.

## Tests

| Command                    | Covers                                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm test`                 | slugs, SKU pattern, matrix, publish rules, category cycles/depth, taka parsing, image signatures, Cloudinary signing, settings, role matrix                        |
| `npm run test:integration` | transaction rollback, duplicate SKU/combination, order-protected variants, optimistic lock, 403s, search in three scripts, storefront visibility, storage clean-up |
| `npm run test:e2e`         | admin → upload (mock) → publish → Bengali and English pages with OG tags → price change → archive 404 → 403 for a read-only role                                   |

The E2E suite builds into `.next-e2e` and runs against the `_test` database on
port 3200 (Chromium only; install once with `npx playwright install chromium`).
