# US Export House

Multi-branch, omni-channel e-commerce platform for a Bangladeshi menswear retailer:
a Bengali-first storefront plus an English admin dashboard for products,
location-based inventory, orders, in-store sales, payments, courier and reports.

Built as a **modular full-stack monolith** on Next.js — there is no separate backend.

> **Status: Phase 4 of 13 complete** (database design). The PostgreSQL schema,
> its migrations and a development seed are in place: 48 tables, 245 sample
> variants and stock at four locations. The storefront still renders the Phase 3
> sample data; Phase 6 points it at these tables.

---

## Tech stack

| Area       | Choice                                                  |
| ---------- | ------------------------------------------------------- |
| Framework  | Next.js 16 (App Router, Turbopack), React 19            |
| Language   | TypeScript 5.9, `strict` + `noUncheckedIndexedAccess`   |
| Styling    | Tailwind CSS v4 (CSS-first config) + shadcn/ui          |
| i18n       | next-intl 4 — `bn` (default, no prefix), `en` (`/en`)   |
| Validation | Zod 4 (env, and every user input from Phase 4 on)       |
| Database   | PostgreSQL 17 (Docker locally; Neon/Supabase later)     |
| ORM        | Prisma 7.10.1 (`prisma-client` generator, `pg` adapter) |
| Auth       | Auth.js v5 — added in Phase 5                           |
| Icons      | lucide-react                                            |
| Tests      | Vitest (unit); Playwright e2e in Phase 13               |

All versions are pinned exactly in `package.json` (no `^`), so every machine and
CI run installs the same tree.

---

## Requirements

- Node.js 22 (see `.nvmrc`; anything `>=20.9` works)
- Docker Desktop (for the local PostgreSQL container)
- Git

---

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Create your local environment file
cp .env.example .env.local
#    then set AUTH_SECRET to a real value:
#    node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 3. Start PostgreSQL
#    If port 5432 is busy (a native PostgreSQL service, or another project),
#    put POSTGRES_PORT=55432 in a local .env file and match it in DATABASE_URL.
npm run db:up

# 4. Create the schema and load development data
npm run db:migrate      # applies prisma/migrations
npm run db:seed         # settings, locations, catalogue, sample orders
npm run db:verify       # row counts, integrity and guard-rail checks

# 5. Start the app
npm run dev
```

Open:

- <http://localhost:3000> — Bengali storefront (default locale, no URL prefix)
- <http://localhost:3000/en> — English storefront
- <http://localhost:3000/api/health> — health check and active integration modes

---

## Scripts

| Command                     | What it does                                             |
| --------------------------- | -------------------------------------------------------- |
| `npm run dev`               | Dev server on port 3000                                  |
| `npm run build`             | Production build                                         |
| `npm start`                 | Serve the production build                               |
| `npm run typecheck`         | `tsc --noEmit`                                           |
| `npm run lint`              | ESLint, including the architecture boundary rules        |
| `npm run format`            | Prettier write (`format:check` to verify only)           |
| `npm test`                  | Vitest unit tests                                        |
| `npm run verify`            | typecheck + lint + format check + tests (what CI runs)   |
| `npm run db:up`             | Start the PostgreSQL container                           |
| `npm run db:down`           | Stop it (data is kept in the `use_postgres_data` volume) |
| `npm run db:generate`       | Regenerate the Prisma client into `src/generated/prisma` |
| `npm run db:migrate`        | Create and apply a migration (development)               |
| `npm run db:migrate:deploy` | Apply pending migrations (CI, staging, production)       |
| `npm run db:seed`           | Load development data                                    |
| `npm run db:verify`         | Row counts, data integrity and guard-rail checks         |
| `npm run db:studio`         | Browse the data in Prisma Studio                         |
| `npm run db:reset`          | **Destroys all data**, re-migrates and re-seeds          |
| `npm run db:nuke`           | Stop the container and delete its volume                 |
| `npm run db:logs`           | Follow database logs                                     |

---

## Architecture

Four layers, strictly separated (see `docs/ARCHITECTURE.md`):

```
src/app, src/components      Presentation  - pages, UI, Server Actions, Route Handlers
src/modules/*/*.service.ts   Business logic - rules, Zod validation, permissions, transactions
src/modules/*/*.repository.ts Data access   - Prisma queries only
PostgreSQL                   The single source of truth
```

Rules that `npm run lint` enforces mechanically:

- `@prisma/client` may only be imported by `*.repository.ts` (and `src/lib/db.ts`).
- Pages, components and integrations may not import a repository — they call a service.
- Integrations (`src/integrations/**`) may not import modules; services drive them.
- No TypeScript `enum` (union types / Prisma enums instead).

### Folder map

```
src/
  app/
    [locale]/(storefront)/   Bengali + English customer pages
    [locale]/(auth)/         phone login / OTP (Phase 5)
    admin/                   English admin dashboard (Phase 5+)
    api/health/              health check
  modules/                   one folder per domain (catalog, inventory, orders, pos, …)
  integrations/              payments/, couriers/, sms/, storage/ behind interfaces
  components/ui/             shadcn/ui primitives
  components/shared/         cross-feature components (e.g. locale switcher)
  i18n/                      routing, request config, navigation, messages/{bn,en}.json
  lib/                       money.ts, errors.ts, utils.ts, fonts.ts
  config/                    env.ts (Zod validated), constants.ts
  proxy.ts                   Next.js 16 proxy (formerly middleware): locale negotiation
prisma/                      schema + migrations + seed (Phase 4)
tests/unit, tests/e2e
```

---

## Pages built in Phase 3

Storefront (Bengali at `/`, English at `/en`):

| Page                     | Route                                              |
| ------------------------ | -------------------------------------------------- |
| Home                     | `/`                                                |
| Shop / product listing   | `/shop` (filters, sort and search as URL state)    |
| Category                 | `/category/[slug]`                                 |
| Product detail           | `/product/[slug]`                                  |
| Cart                     | `/cart`                                            |
| Checkout                 | `/checkout`                                        |
| Customer account         | `/account`                                         |
| Order tracking           | `/track-order`                                     |
| About us                 | `/about`                                           |
| Contact us               | `/contact`                                         |
| FAQ                      | `/faq`                                             |
| Privacy policy           | `/privacy-policy`                                  |
| Shipping & return policy | `/shipping-returns` (draft, shown behind a notice) |

Admin visual shell (English, `noindex`): the `/admin` dashboard plus sidebar
screens for products, categories, inventory, transfers, orders, in-store sale,
returns, shipments, customers, reports, audit log, locations, staff, content and
settings. Each screen states which phase delivers the real functionality.

Component library: `src/components/ui` (button, input, textarea, label, select,
checkbox and radio, badge, card, skeleton, separator) and
`src/components/shared` (header, footer, locale switcher, mobile nav, product
card and grid, price, rating, breadcrumbs, quantity stepper, newsletter form,
empty and error states, policy renderer, sample-content notice).

## Database

The schema lives in `prisma/schema.prisma` — 48 models and 28 enums:

| Group             | Tables                                                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| People & access   | User, Account, Session, VerificationToken, OtpChallenge, Role, StaffLocationAccess, Address                                 |
| Locations & stock | Location, InventoryLevel, InventoryMovement, StockTransfer(+Item), StockCount(+Item)                                        |
| Catalogue         | Category, Brand, SizeChart, Product, ProductImage, ProductOption, OptionValue, ProductVariant, ProductVariantOption, Review |
| Cart & orders     | Cart, CartItem, Order, OrderItem, OrderStatusHistory                                                                        |
| Money             | Payment, PaymentAttempt, Refund                                                                                             |
| Returns           | ReturnRequest, ReturnItem                                                                                                   |
| Promotions        | Coupon, CouponRedemption                                                                                                    |
| Shipping          | ShippingZone, Shipment, ShipmentEvent                                                                                       |
| Content           | Banner, HomeSection, Page, MenuItem, NewsletterSubscriber, ContactMessage                                                   |
| Settings & audit  | Setting, AuditLog                                                                                                           |

Rules the schema holds to:

- **Money is integer poisha.** No float or decimal money column exists.
- **Bilingual pairs**: `nameEn` is required, `nameBn` is optional and falls back
  to English. The admin edits both languages.
- **Stock is per location** in `InventoryLevel` (`onHand`, `reserved`); every
  change is appended to the `InventoryMovement` ledger, which is never updated
  or deleted. `available` is always computed as `onHand - reserved`.
- **History is snapshotted**: an order line keeps the product name, SKU and
  price it was sold at, so editing the catalogue cannot rewrite past orders.
- **Soft delete** (`deletedAt`) on products, variants, categories, locations,
  coupons, roles and users.

Guard rails live in the database, not only in application code (see
`prisma/migrations/*_constraints_and_sequences/migration.sql`):

- `onHand >= 0`, `reserved >= 0`, `reserved <= onHand`
- `Order.totalPoisha = subtotal - discount + shipping`; discount <= subtotal;
  refunded <= total
- `OrderItem.lineTotalPoisha = unitPrice * quantity`, quantity > 0
- percentage coupons between 1 and 100; reviews between 1 and 5 stars
- one default online-fulfilment location, one default shipping zone, one
  default address per customer, case-insensitive unique coupon codes
- a stock transfer cannot have the same source and destination
- sequences for order numbers (`UEH-2026-001`), transfers, counts and returns

`npm run db:verify` proves each of these by trying to write invalid data inside
a transaction that is rolled back.

### What the seed creates

24 settings, 2 shipping zones, 1 warehouse + 3 branches, 7 roles, a Super Admin
staff account (**with no password until Phase 5**), 4 categories, 24 products
with 245 variants, stock at every location with matching ledger entries, 2
coupons, 6 approved sample reviews, banners, home sections, menu items, 4
content pages (the return policy stays `DRAFT`) and 3 sample orders with
payments, shipments and stock movements.

The sample content is imported from the Phase 3 mock modules, so the database
and the current UI cannot drift apart.

### Prisma 7 notes

- The client is generated into `src/generated/prisma` (not `node_modules`) and
  is gitignored; `npm install` regenerates it through `postinstall`.
- Only `src/lib/db.ts` may import the generated client, and only repositories
  may import `src/lib/db.ts`. ESLint enforces both.
- The connection string, migrations directory and seed command are configured
  in `prisma.config.ts`.

## Conventions

- **Money is integer poisha** (1 BDT = 100 poisha). Never use floats for money;
  always go through `src/lib/money.ts`.
- **All UI text comes from `src/i18n/messages/*.json`** — no hardcoded strings in
  components. Bengali is the default; English falls back for missing content.
- **Brand tokens live in one place**: the `:root` block in `src/app/globals.css`.
  Changing a colour, radius or font there changes the whole site.
- **Every input is validated on the server** with Zod, and every mutation checks
  permission + branch access in the service layer (not just in the UI).
- Code, comments, file names and commit messages are in English.

---

## Environment variables

`src/config/env.ts` validates `process.env` with Zod and is imported from
`next.config.ts`, so the app refuses to start when something is missing or unsafe.
Beyond the per-variable checks it rejects dangerous combinations, for example:

- `APP_ENV=production` with `COURIER_STEADFAST_MODE=mock`, `SMS_PROVIDER=dev`,
  `PAYMENT_SSLCOMMERZ_MODE=sandbox`, `USE_MOCK_STOREFRONT_DATA=true` or
  `STORAGE_PROVIDER=local`
- a `sandbox`/`live` integration mode without its credentials

`APP_ENV` (`local` | `staging` | `production`) describes the **deployment target**
and is what the safety guards key on; `NODE_ENV` only describes the build.

See `.env.example` for the full list. Never commit real credentials.

---

## What is mock or placeholder right now

| Item                                                                 | Replaced in                               |
| -------------------------------------------------------------------- | ----------------------------------------- |
| Catalogue, reviews, cart and orders (`src/modules/*/*.mock.ts`)      | Phase 6 (catalogue), 8 (cart), 9 (orders) |
| Product and editorial imagery (generated SVG under `public/images/`) | when real photography arrives             |
| Brand colours, radius, fonts (Inter + Hind Siliguri)                 | when brand assets arrive                  |
| `STORAGE_PROVIDER=local`                                             | Phase 6 (Cloudinary or S3)                |
| `SMS_PROVIDER=dev` (console OTP)                                     | before launch (real SMS provider)         |
| `COURIER_STEADFAST_MODE=mock`                                        | Phase 11 (Steadfast credentials)          |
| `PAYMENT_SSLCOMMERZ_MODE=disabled`                                   | Phase 10 (sandbox, then live)             |
| Storefront reads the mock modules, not the database                  | Phase 6                                   |

Nothing here pretends an integration works: mock modes are reported by the health
endpoint and will be badged **MOCK** in the admin UI.

---

## Deployment

Target: Vercel (app) + managed PostgreSQL in Singapore + Cloudinary/S3 for images.
Three environments — local, staging (sandbox credentials), production (live).

Vercel-specific APIs are kept out of business logic and behind the interfaces in
`src/integrations/`, so a later move to a VPS (Docker + Nginx) only changes the
hosting adapter. The migration guide is written in Phase 13.
