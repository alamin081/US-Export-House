/**
 * ============================================================================
 * DEVELOPMENT SEED — US Export House
 * ============================================================================
 *
 * Fills a fresh database with the data the business has already agreed on
 * (settings, shipping zones, locations, roles) plus the sample catalogue the
 * Phase 3 storefront renders today. The sample content is imported straight
 * from the mock modules under `src/modules`, so the database and the current
 * UI cannot drift apart; Phase 6 then points the storefront at these tables.
 *
 * Run with: npm run db:seed        (after npm run db:migrate)
 *           npm run db:reset       (drops everything, migrates, seeds)
 *
 * Safety: refuses to run against a production deployment.
 */
import { config as loadEnvFiles } from "dotenv";

loadEnvFiles({ path: [".env.local", ".env"], quiet: true });

import { PrismaPg } from "@prisma/adapter-pg";

import { SEED_DEFAULTS } from "../src/config/constants";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  MOCK_CATEGORIES,
  MOCK_PRODUCTS,
  MOCK_REVIEWS,
  SIZE_GUIDES,
  type MockProduct,
} from "../src/modules/catalog/catalog.mock";
import {
  MOCK_ABOUT_SECTIONS,
  MOCK_BRAND_INTRO,
  MOCK_COLLECTIONS,
  MOCK_FAQ_ITEMS,
  MOCK_HERO,
  MOCK_PRIVACY_POLICY,
  MOCK_PROMO_BANNERS,
  MOCK_SHIPPING_RETURN_POLICY,
  MOCK_SHOWROOMS,
  type MockPolicySection,
} from "../src/modules/content/content.mock";
import { SYSTEM_ROLES } from "../src/modules/access/permissions";
import { MOCK_ORDERS } from "../src/modules/orders/orders.mock";
import { CATALOG_SETTINGS, OPTION_PRESETS } from "./seed-catalog";

if (process.env.APP_ENV === "production") {
  throw new Error("[seed] Refusing to seed a production database.");
}

const connectionString = process.env.DATABASE_URL;
if (connectionString === undefined || connectionString === "") {
  throw new Error("[seed] DATABASE_URL is not set. See .env.example.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Policy/About sections, split per language for the admin editor. */
function sectionsFor(sections: readonly MockPolicySection[], locale: "en" | "bn") {
  return sections.map((section) => ({
    heading: locale === "bn" ? (section.heading.bn ?? section.heading.en) : section.heading.en,
    paragraphs: section.paragraphs.map((paragraph) =>
      locale === "bn" ? (paragraph.bn ?? paragraph.en) : paragraph.en,
    ),
    bullets:
      section.bullets?.map((bullet) => (locale === "bn" ? (bullet.bn ?? bullet.en) : bullet.en)) ??
      [],
  }));
}

/** Short, stable colour code for SKUs: "Sky Blue" -> "SKY". */
function colourCode(name: string): string {
  return name
    .replace(/[^A-Za-z]/g, "")
    .slice(0, 3)
    .toUpperCase();
}

/**
 * Deterministic opening stock, so every developer's database looks the same.
 * Mirrors the availability the Phase 3 mock advertises.
 */
function openingStock(product: MockProduct, variantIndex: number, isWarehouse: boolean): number {
  if (product.availability === "out_of_stock") return 0;
  if (product.availability === "low_stock") return isWarehouse ? 2 : 1;
  return isWarehouse ? 12 + (variantIndex % 7) : 3 + (variantIndex % 4);
}

const log = (step: string, detail: string) => {
  console.info(`  ${step.padEnd(22)} ${detail}`);
};

// ---------------------------------------------------------------------------
// 1. Settings — every business number the spec refuses to hardcode
// ---------------------------------------------------------------------------

type SeedSetting = {
  key: string;
  valueType: "STRING" | "INT" | "BOOLEAN" | "JSON";
  value: string;
  group: string;
  description: string;
  isPublic?: boolean;
};

const SETTINGS: readonly SeedSetting[] = [
  {
    key: "shipping.insideDhakaPoisha",
    valueType: "INT",
    value: String(SEED_DEFAULTS.shipping.insideDhakaPoisha),
    group: "shipping",
    description: "Delivery charge inside Dhaka, in poisha. Provisional.",
  },
  {
    key: "shipping.outsideDhakaPoisha",
    valueType: "INT",
    value: String(SEED_DEFAULTS.shipping.outsideDhakaPoisha),
    group: "shipping",
    description: "Delivery charge outside Dhaka, in poisha. Provisional.",
  },
  {
    key: "shipping.freeThresholdPoisha",
    valueType: "INT",
    value: String(SEED_DEFAULTS.shipping.freeShippingThresholdPoisha),
    group: "shipping",
    description: "Order value from which delivery is free, in poisha. Provisional.",
    isPublic: true,
  },
  {
    key: "orders.unpaidReservationTtlSeconds",
    valueType: "INT",
    value: String(SEED_DEFAULTS.orders.unpaidReservationTtlSeconds),
    group: "orders",
    description: "How long an unpaid online order holds its stock reservation.",
  },
  {
    key: "orders.numberPrefix",
    valueType: "STRING",
    value: "UEH",
    group: "orders",
    description: "Order number prefix: UEH-2026-001.",
  },
  {
    key: "orders.numberPadding",
    valueType: "INT",
    value: "3",
    group: "orders",
    description: "Digits the order sequence is padded to.",
  },
  {
    key: "returns.windowDays",
    valueType: "INT",
    value: String(SEED_DEFAULTS.returns.requestWindowDays),
    group: "returns",
    description: "Days after delivery a return may be requested. Awaiting approval.",
    isPublic: true,
  },
  {
    key: "returns.policyApproved",
    valueType: "BOOLEAN",
    value: "false",
    group: "returns",
    description: "The return policy page stays draft until this is true.",
  },
  {
    key: "returns.conditionsEn",
    valueType: "STRING",
    value: "Unused, unwashed, with original tags and packaging.",
    group: "returns",
    description: "Return conditions shown to the customer (English).",
    isPublic: true,
  },
  {
    key: "returns.conditionsBn",
    valueType: "STRING",
    value: "অব্যবহৃত, না-ধোয়া, অরিজিনাল ট্যাগ ও প্যাকেজিং সহ।",
    group: "returns",
    description: "Return conditions shown to the customer (Bengali).",
    isPublic: true,
  },
  {
    key: "otp.length",
    valueType: "INT",
    value: String(SEED_DEFAULTS.otp.length),
    group: "auth",
    description: "Digits in the SMS login code.",
  },
  {
    key: "otp.lifetimeSeconds",
    valueType: "INT",
    value: String(SEED_DEFAULTS.otp.lifetimeSeconds),
    group: "auth",
    description: "How long an OTP stays valid.",
  },
  {
    key: "otp.maxAttempts",
    valueType: "INT",
    value: "5",
    group: "auth",
    description: "Verification attempts before a challenge is locked.",
  },
  {
    key: "otp.maxPerPhonePerHour",
    valueType: "INT",
    value: "5",
    group: "auth",
    description: "Rate limit per phone number.",
  },
  {
    key: "otp.maxPerIpPerHour",
    valueType: "INT",
    value: "20",
    group: "auth",
    description: "Rate limit per IP address.",
  },
  {
    key: "inventory.lowStockDefaultThreshold",
    valueType: "INT",
    value: "5",
    group: "inventory",
    description: "Fallback low-stock threshold when a variant has none.",
  },
  {
    key: "fulfillment.defaultLocationCode",
    valueType: "STRING",
    value: "WH-DHK",
    group: "fulfillment",
    description: "Location online orders reserve stock from by default.",
  },
  {
    key: "storefront.defaultLocale",
    valueType: "STRING",
    value: "bn",
    group: "storefront",
    description: "Default storefront language.",
    isPublic: true,
  },
  {
    key: "storefront.numerals",
    valueType: "STRING",
    value: "latin",
    group: "storefront",
    description: "Digits used for prices and counts in both languages.",
    isPublic: true,
  },
  {
    key: "storefront.currencyCode",
    valueType: "STRING",
    value: "BDT",
    group: "storefront",
    description: "Currency. All amounts are stored as integer poisha.",
    isPublic: true,
  },
  {
    key: "vat.enabled",
    valueType: "BOOLEAN",
    value: "false",
    group: "tax",
    description: "OPEN QUESTION 5: VAT handling is not decided yet.",
  },
  {
    key: "vat.ratePercent",
    valueType: "INT",
    value: "0",
    group: "tax",
    description: "OPEN QUESTION 5: VAT rate, once confirmed.",
  },
  {
    key: "vat.bin",
    valueType: "STRING",
    value: "",
    group: "tax",
    description: "OPEN QUESTION 5: NBR BIN number for invoices.",
  },
  {
    key: "pos.enabled",
    valueType: "BOOLEAN",
    value: "true",
    group: "pos",
    description: "Whether branch staff can ring up in-store sales.",
  },
];

async function seedSettings() {
  const all: readonly SeedSetting[] = [...SETTINGS, ...CATALOG_SETTINGS];
  for (const setting of all) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: {},
      create: {
        key: setting.key,
        valueType: setting.valueType,
        value: setting.value,
        group: setting.group,
        description: setting.description,
        isPublic: setting.isPublic ?? false,
      },
    });
  }
  log("settings", `${SETTINGS.length + CATALOG_SETTINGS.length} keys`);
}

// Phase 6: the size and colour library the variant generator offers.
async function seedOptionPresets() {
  let created = 0;
  for (const [index, preset] of OPTION_PRESETS.entries()) {
    const existing = await prisma.optionPreset.findUnique({
      where: { type_group_code: { type: preset.type, group: preset.group, code: preset.code } },
      select: { id: true },
    });
    if (existing !== null) continue;
    // A preset inserted between existing ones (e.g. waist 29 between 28 and
    // 30 in a database seeded earlier) shares its predecessor's sortOrder
    // instead of renumbering existing rows; the admin breaks ties by code.
    const sameGroup = (other: (typeof OPTION_PRESETS)[number]) =>
      other.type === preset.type && other.group === preset.group;
    const findSortOrder = (other: (typeof OPTION_PRESETS)[number] | undefined) =>
      other === undefined
        ? null
        : prisma.optionPreset.findUnique({
            where: { type_group_code: { type: other.type, group: other.group, code: other.code } },
            select: { sortOrder: true },
          });
    const next = await findSortOrder(OPTION_PRESETS.slice(index + 1).find(sameGroup));
    const previous = await findSortOrder(OPTION_PRESETS.slice(0, index).reverse().find(sameGroup));
    const sortOrder = next !== null && previous !== null ? previous.sortOrder : index;
    await prisma.optionPreset.create({ data: { ...preset, sortOrder } });
    created += 1;
  }
  log("option presets", `${created} added, ${OPTION_PRESETS.length - created} already present`);
}

// ---------------------------------------------------------------------------
// 2. Shipping zones
// ---------------------------------------------------------------------------

async function seedShippingZones() {
  const zones = [
    {
      code: "inside_dhaka",
      nameEn: "Inside Dhaka",
      nameBn: "ঢাকার ভেতরে",
      ratePoisha: SEED_DEFAULTS.shipping.insideDhakaPoisha,
      isDefault: true,
      sortOrder: 0,
    },
    {
      code: "outside_dhaka",
      nameEn: "Outside Dhaka",
      nameBn: "ঢাকার বাইরে",
      ratePoisha: SEED_DEFAULTS.shipping.outsideDhakaPoisha,
      isDefault: false,
      sortOrder: 1,
    },
  ];

  for (const zone of zones) {
    await prisma.shippingZone.upsert({
      where: { code: zone.code },
      update: {},
      create: zone,
    });
  }
  log("shipping zones", zones.map((zone) => zone.code).join(", "));
}

// ---------------------------------------------------------------------------
// 3. Locations — one warehouse plus the showrooms
// ---------------------------------------------------------------------------

async function seedLocations() {
  const warehouse = {
    code: "WH-DHK",
    type: "WAREHOUSE" as const,
    nameEn: "Central Warehouse",
    nameBn: "সেন্ট্রাল ওয়্যারহাউস",
    addressEn: "Placeholder address, Tejgaon, Dhaka",
    addressBn: "প্লেসহোল্ডার ঠিকানা, তেজগাঁও, ঢাকা",
    phone: "+8801700000000",
    isOnlineFulfillment: true,
    isDefaultOnlineFulfillment: true,
    sortOrder: 0,
  };

  await prisma.location.upsert({
    where: { code: warehouse.code },
    update: {},
    create: warehouse,
  });

  // PLACEHOLDER: branch names and addresses come from the business (open
  // question 12). These mirror the Phase 3 storefront content.
  const branchCodes = ["BR-GUL", "BR-DHN", "BR-CTG"];
  for (const [index, showroom] of MOCK_SHOWROOMS.entries()) {
    const code = branchCodes[index] ?? `BR-${index}`;
    await prisma.location.upsert({
      where: { code },
      update: {},
      create: {
        code,
        type: "BRANCH",
        nameEn: showroom.name.en,
        nameBn: showroom.name.bn ?? null,
        addressEn: showroom.address.en,
        addressBn: showroom.address.bn ?? null,
        hoursEn: showroom.hours.en,
        hoursBn: showroom.hours.bn ?? null,
        phone: showroom.phone,
        // Open question 2: whether branches fulfil online orders. Until the
        // business decides, only the warehouse does.
        isOnlineFulfillment: false,
        sortOrder: index + 1,
      },
    });
  }

  log("locations", `1 warehouse + ${MOCK_SHOWROOMS.length} branches`);
}

// ---------------------------------------------------------------------------
// 4. Roles and the first staff account
// ---------------------------------------------------------------------------

/**
 * The seven system roles come from src/modules/access/permissions.ts, the same
 * definitions the authorization code checks against. Create-only: re-running
 * the seed never overwrites a role an administrator has since edited.
 */
async function seedRoles() {
  for (const role of SYSTEM_ROLES) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: {},
      create: {
        name: role.name,
        description: role.description,
        permissions: [...role.permissions],
        allLocations: role.allLocations,
        isSystem: true,
      },
    });
  }
  log("roles", SYSTEM_ROLES.map((role) => role.name).join(", "));
}

async function seedStaff() {
  const superAdmin = await prisma.role.findUnique({ where: { name: "Super Admin" } });
  if (superAdmin === null) throw new Error("[seed] Super Admin role missing");

  // PLACEHOLDER ACCOUNT: `passwordHash` is deliberately null, so this account
  // cannot be signed into. Phase 5 adds Argon2id hashing and a documented
  // command to set the first password.
  const user = await prisma.user.upsert({
    where: { email: "admin@usexporthouse.local" },
    update: {},
    create: {
      email: "admin@usexporthouse.local",
      name: "Seed Super Admin",
      kind: "STAFF",
      roleId: superAdmin.id,
      passwordHash: null,
    },
  });

  log("staff", `${user.email} (no password until Phase 5)`);
  return user.id;
}

// ---------------------------------------------------------------------------
// 5. Size charts, brand, categories
// ---------------------------------------------------------------------------

const SIZE_CHART_COLUMNS = {
  shirt: [
    { en: "Size", bn: "সাইজ" },
    { en: "Chest", bn: "বুক" },
    { en: "Shoulder", bn: "কাঁধ" },
    { en: "Length", bn: "লম্বা" },
  ],
  denim: [
    { en: "Size", bn: "সাইজ" },
    { en: "Waist", bn: "কোমর" },
    { en: "Hip", bn: "হিপ" },
    { en: "Inseam", bn: "ইনসিম" },
  ],
};

async function seedSizeCharts(): Promise<Map<string, string>> {
  const charts = new Map<string, string>();

  for (const [categorySlug, rows] of Object.entries(SIZE_GUIDES)) {
    const isDenim = categorySlug === "denim-jeans";
    const nameEn = `${categorySlug.replace(/-/g, " ")} size chart`;

    const existing = await prisma.sizeChart.findFirst({ where: { nameEn } });
    const data = {
      nameEn,
      nameBn: null,
      noteEn: "Garment measurements in inches. Between two sizes, take the larger one.",
      noteBn: "পোশাকের মাপ ইঞ্চিতে। দুই সাইজের মাঝে থাকলে বড়টি নিন।",
      columns: isDenim ? SIZE_CHART_COLUMNS.denim : SIZE_CHART_COLUMNS.shirt,
      rows: rows.map((row) => ({
        size: row.size,
        values: [row.chest, row.shoulder, row.length],
      })),
    };

    const chart = existing ?? (await prisma.sizeChart.create({ data }));

    charts.set(categorySlug, chart.id);
  }

  log("size charts", `${charts.size} charts`);
  return charts;
}

async function seedBrand(): Promise<string> {
  const brand = await prisma.brand.upsert({
    where: { slug: "us-export-house" },
    update: {},
    create: {
      slug: "us-export-house",
      nameEn: "US Export House",
      nameBn: "ইউএস এক্সপোর্ট হাউস",
    },
  });
  log("brand", brand.nameEn);
  return brand.id;
}

async function seedCategories(sizeCharts: Map<string, string>): Promise<Map<string, string>> {
  const ids = new Map<string, string>();

  for (const [index, category] of MOCK_CATEGORIES.entries()) {
    const record = await prisma.category.upsert({
      where: { slug: category.slug },
      update: {},
      create: {
        slug: category.slug,
        nameEn: category.name.en,
        nameBn: category.name.bn ?? null,
        taglineEn: category.tagline.en,
        taglineBn: category.tagline.bn ?? null,
        descriptionEn: category.description.en,
        descriptionBn: category.description.bn ?? null,
        imageUrl: category.image,
        sizeChartId: sizeCharts.get(category.slug) ?? null,
        sortOrder: index,
      },
    });
    ids.set(category.slug, record.id);
  }

  log("categories", [...ids.keys()].join(", "));
  return ids;
}

// ---------------------------------------------------------------------------
// 6. Products, options, variants, images and opening stock
// ---------------------------------------------------------------------------

async function seedProducts(
  categoryIds: Map<string, string>,
  brandId: string,
  sizeCharts: Map<string, string>,
  staffUserId: string,
) {
  const locations = await prisma.location.findMany({ orderBy: { sortOrder: "asc" } });
  let variantCount = 0;
  let levelCount = 0;

  for (const product of MOCK_PRODUCTS) {
    const categoryId = categoryIds.get(product.categorySlug);
    if (categoryId === undefined)
      throw new Error(`[seed] unknown category ${product.categorySlug}`);

    const existing = await prisma.product.findUnique({ where: { slug: product.slug } });

    // A nullable Json column takes `Prisma.DbNull`, not `null`, so a product
    // with no Bengali description simply leaves the column out instead.
    const hasBengaliDescription = product.description.some(
      (paragraph) => paragraph.bn !== undefined,
    );

    const scalars = {
      nameEn: product.name.en,
      nameBn: product.name.bn ?? null,
      summaryEn: product.summary.en,
      summaryBn: product.summary.bn ?? null,
      descriptionEn: product.description.map((paragraph) => paragraph.en),
      ...(hasBengaliDescription
        ? { descriptionBn: product.description.map((paragraph) => paragraph.bn ?? paragraph.en) }
        : {}),
      fabricEn: product.fabric.en,
      fabricBn: product.fabric.bn ?? null,
      careEn: product.care.map((item) => item.en),
      careBn: product.care.map((item) => item.bn ?? item.en),
      categoryId,
      brandId,
      sizeChartId: sizeCharts.get(product.categorySlug) ?? null,
      status: "PUBLISHED" as const,
      isNew: product.tags.includes("new"),
      isBestseller: product.tags.includes("bestseller"),
      isFeatured: product.tags.includes("bestseller"),
      ratingAverage: product.rating,
      ratingCount: product.reviewCount,
      publishedAt: new Date("2026-10-01T00:00:00+06:00"),
    };

    // Create-only: an existing product (and everything under it) is left as is.
    if (existing !== null) continue;

    const created = await prisma.product.create({
      data: { slug: product.slug, ...scalars },
    });

    // --- images ----------------------------------------------------------
    await prisma.productImage.createMany({
      data: product.images.map((image, index) => ({
        productId: created.id,
        url: image.src,
        altEn: image.alt.en,
        altBn: image.alt.bn ?? null,
        sortOrder: index,
      })),
    });

    // --- options and values ---------------------------------------------
    const sizeOption = await prisma.productOption.create({
      data: {
        productId: created.id,
        type: "SIZE",
        nameEn: "Size",
        nameBn: "সাইজ",
        sortOrder: 0,
        values: {
          create: product.sizes.map((size, index) => ({
            valueEn: size,
            valueBn: size,
            sortOrder: index,
          })),
        },
      },
      include: { values: true },
    });

    const colourOption = await prisma.productOption.create({
      data: {
        productId: created.id,
        type: "COLOUR",
        nameEn: "Colour",
        nameBn: "রঙ",
        sortOrder: 1,
        values: {
          create: product.colours.map((colour, index) => ({
            valueEn: colour.name.en,
            valueBn: colour.name.bn ?? null,
            hex: colour.hex,
            sortOrder: index,
          })),
        },
      },
      include: { values: true },
    });

    // --- variants: every size x colour combination -----------------------
    let variantIndex = 0;
    for (const sizeValue of sizeOption.values) {
      for (const colourValue of colourOption.values) {
        const sku = `${product.sku}-${sizeValue.valueEn}-${colourCode(colourValue.valueEn)}`;

        const variant = await prisma.productVariant.create({
          data: {
            productId: created.id,
            sku,
            pricePoisha: product.pricePoisha,
            comparePricePoisha: product.comparePricePoisha ?? null,
            // PLACEHOLDER cost, for stock-valuation reports only.
            costPoisha: Math.round(product.pricePoisha * 0.55),
            labelEn: `${sizeValue.valueEn} / ${colourValue.valueEn}`,
            labelBn: `${sizeValue.valueBn ?? sizeValue.valueEn} / ${colourValue.valueBn ?? colourValue.valueEn}`,
            optionValues: {
              create: [{ optionValueId: sizeValue.id }, { optionValueId: colourValue.id }],
            },
          },
        });
        variantCount += 1;

        // --- opening stock per location, with a ledger entry -------------
        for (const location of locations) {
          const isWarehouse = location.type === "WAREHOUSE";
          const quantity = openingStock(product, variantIndex, isWarehouse);

          await prisma.inventoryLevel.create({
            data: {
              variantId: variant.id,
              locationId: location.id,
              onHand: quantity,
              reserved: 0,
              lowStockThreshold: isWarehouse ? 5 : 3,
            },
          });
          levelCount += 1;

          if (quantity > 0) {
            await prisma.inventoryMovement.create({
              data: {
                variantId: variant.id,
                locationId: location.id,
                type: "PURCHASE_RECEIVE",
                quantity,
                reason: "Opening stock (development seed)",
                referenceType: "SEED",
                referenceId: "opening-stock",
                userId: staffUserId,
              },
            });
          }
        }

        variantIndex += 1;
      }
    }
  }

  log("products", `${MOCK_PRODUCTS.length} products, ${variantCount} variants`);
  log("inventory", `${levelCount} stock rows with opening ledger entries`);
}

// ---------------------------------------------------------------------------
// 7. Coupons and reviews
// ---------------------------------------------------------------------------

async function seedCoupons() {
  const coupons = [
    {
      code: "WELCOME10",
      type: "PERCENTAGE" as const,
      value: 10,
      channel: "ONLINE" as const,
      labelEn: "Welcome offer — 10% off",
      labelBn: "ওয়েলকাম অফার — 10% ছাড়",
      usageLimitPerCustomer: 1,
    },
    {
      code: "EID15",
      type: "PERCENTAGE" as const,
      value: 15,
      channel: "ONLINE" as const,
      labelEn: "Eid offer — 15% off",
      labelBn: "ঈদ অফার — 15% ছাড়",
      minSubtotalPoisha: 300_000,
    },
  ];

  for (const coupon of coupons) {
    await prisma.coupon.upsert({
      where: { code: coupon.code },
      update: {},
      create: coupon,
    });
  }
  log("coupons", coupons.map((coupon) => coupon.code).join(", "));
}

async function seedReviews() {
  let count = 0;
  for (const review of MOCK_REVIEWS) {
    const product = await prisma.product.findUnique({ where: { slug: review.productSlug } });
    if (product === null) continue;

    const existing = await prisma.review.findFirst({
      where: { productId: product.id, authorName: review.author, titleEn: review.title.en },
    });
    if (existing !== null) continue;

    await prisma.review.create({
      data: {
        productId: product.id,
        authorName: review.author,
        cityEn: review.city.en,
        cityBn: review.city.bn ?? null,
        rating: review.rating,
        titleEn: review.title.en,
        titleBn: review.title.bn ?? null,
        bodyEn: review.body.en,
        bodyBn: review.body.bn ?? null,
        isApproved: true,
        isVerifiedPurchase: review.verifiedPurchase,
        createdAt: new Date(review.date),
      },
    });
    count += 1;
  }
  log("reviews", `${count} sample reviews (approved)`);
}

// ---------------------------------------------------------------------------
// 8. Content: banners, home sections, pages, menus
// ---------------------------------------------------------------------------

async function seedContent(staffUserId: string) {
  // --- banners ---------------------------------------------------------
  await prisma.banner.upsert({
    where: { key: "home-hero" },
    update: {},
    create: {
      key: "home-hero",
      placement: "HOME_HERO",
      status: "PUBLISHED",
      eyebrowEn: MOCK_HERO.eyebrow.en,
      eyebrowBn: MOCK_HERO.eyebrow.bn ?? null,
      titleEn: MOCK_HERO.title.en,
      titleBn: MOCK_HERO.title.bn ?? null,
      bodyEn: MOCK_HERO.subtitle.en,
      bodyBn: MOCK_HERO.subtitle.bn ?? null,
      ctaLabelEn: MOCK_HERO.primaryCta.en,
      ctaLabelBn: MOCK_HERO.primaryCta.bn ?? null,
      href: MOCK_HERO.primaryHref,
      imageUrl: MOCK_HERO.image,
      sortOrder: 0,
    },
  });

  for (const [index, promo] of MOCK_PROMO_BANNERS.entries()) {
    await prisma.banner.upsert({
      where: { key: promo.id },
      update: {},
      create: {
        key: promo.id,
        placement: "HOME_PROMO",
        status: "PUBLISHED",
        eyebrowEn: promo.eyebrow.en,
        eyebrowBn: promo.eyebrow.bn ?? null,
        titleEn: promo.title.en,
        titleBn: promo.title.bn ?? null,
        bodyEn: promo.body.en,
        bodyBn: promo.body.bn ?? null,
        ctaLabelEn: promo.cta.en,
        ctaLabelBn: promo.cta.bn ?? null,
        href: promo.href,
        imageUrl: promo.image,
        sortOrder: index,
      },
    });
  }

  // --- home sections, in the order the Phase 3 page renders them -------
  const sections = [
    { type: "HERO" as const, config: { bannerKey: "home-hero" } },
    { type: "CATEGORY_GRID" as const, config: { limit: 4 } },
    { type: "NEW_ARRIVALS" as const, config: { limit: 4 } },
    { type: "PROMO_BANNER" as const, config: { bannerKey: "promo-01" } },
    { type: "BEST_SELLERS" as const, config: { limit: 4 } },
    {
      type: "COLLECTION_GRID" as const,
      config: {
        collections: MOCK_COLLECTIONS.map((collection) => ({
          id: collection.id,
          titleEn: collection.title.en,
          titleBn: collection.title.bn ?? null,
          descriptionEn: collection.description.en,
          descriptionBn: collection.description.bn ?? null,
          href: collection.href,
          image: collection.image,
        })),
      },
    },
    {
      type: "BRAND_INTRO" as const,
      config: {
        eyebrowEn: MOCK_BRAND_INTRO.eyebrow.en,
        eyebrowBn: MOCK_BRAND_INTRO.eyebrow.bn ?? null,
        titleEn: MOCK_BRAND_INTRO.title.en,
        titleBn: MOCK_BRAND_INTRO.title.bn ?? null,
        image: MOCK_BRAND_INTRO.image,
        stats: MOCK_BRAND_INTRO.stats.map((stat) => ({
          value: stat.value,
          labelEn: stat.label.en,
          labelBn: stat.label.bn ?? null,
        })),
      },
    },
    { type: "REVIEWS" as const, config: { limit: 3 } },
    { type: "NEWSLETTER" as const, config: {} },
  ];

  const existingSections = await prisma.homeSection.count();
  if (existingSections === 0) {
    for (const [index, section] of sections.entries()) {
      await prisma.homeSection.create({
        data: { type: section.type, config: section.config, sortOrder: index, status: "PUBLISHED" },
      });
    }
  }

  // --- pages ------------------------------------------------------------
  const faqSections = (locale: "en" | "bn") => {
    const groups: Array<{ group: string; headingEn: string; headingBn: string }> = [
      { group: "orders", headingEn: "Orders & account", headingBn: "অর্ডার ও অ্যাকাউন্ট" },
      { group: "shipping", headingEn: "Delivery", headingBn: "ডেলিভারি" },
      { group: "returns", headingEn: "Returns & refunds", headingBn: "রিটার্ন ও রিফান্ড" },
      { group: "products", headingEn: "Products & sizing", headingBn: "পণ্য ও সাইজ" },
    ];

    return groups.map((group) => ({
      heading: locale === "bn" ? group.headingBn : group.headingEn,
      items: MOCK_FAQ_ITEMS.filter((item) => item.group === group.group).map((item) => ({
        question: locale === "bn" ? (item.question.bn ?? item.question.en) : item.question.en,
        answer: locale === "bn" ? (item.answer.bn ?? item.answer.en) : item.answer.en,
      })),
    }));
  };

  const pages = [
    {
      slug: "about",
      status: "PUBLISHED" as const,
      titleEn: "About us",
      titleBn: "আমাদের সম্পর্কে",
      summaryEn: MOCK_BRAND_INTRO.paragraphs[0]?.en ?? null,
      summaryBn: MOCK_BRAND_INTRO.paragraphs[0]?.bn ?? null,
      sectionsEn: sectionsFor(MOCK_ABOUT_SECTIONS, "en"),
      sectionsBn: sectionsFor(MOCK_ABOUT_SECTIONS, "bn"),
      publishedAt: new Date(),
    },
    {
      slug: "faq",
      status: "PUBLISHED" as const,
      titleEn: "Frequently asked questions",
      titleBn: "সাধারণ জিজ্ঞাসা",
      summaryEn: "Ordering, delivery, returns and sizing.",
      summaryBn: "অর্ডার, ডেলিভারি, রিটার্ন ও সাইজ।",
      sectionsEn: faqSections("en"),
      sectionsBn: faqSections("bn"),
      publishedAt: new Date(),
    },
    {
      slug: MOCK_PRIVACY_POLICY.slug,
      status: "PUBLISHED" as const,
      titleEn: MOCK_PRIVACY_POLICY.title.en,
      titleBn: MOCK_PRIVACY_POLICY.title.bn ?? null,
      summaryEn: MOCK_PRIVACY_POLICY.summary.en,
      summaryBn: MOCK_PRIVACY_POLICY.summary.bn ?? null,
      sectionsEn: sectionsFor(MOCK_PRIVACY_POLICY.sections, "en"),
      sectionsBn: sectionsFor(MOCK_PRIVACY_POLICY.sections, "bn"),
      publishedAt: new Date(MOCK_PRIVACY_POLICY.lastUpdated),
    },
    {
      // DRAFT on purpose: the return policy is not approved yet, so the
      // storefront must not publish it (spec section 3.9, open question 8).
      slug: MOCK_SHIPPING_RETURN_POLICY.slug,
      status: "DRAFT" as const,
      titleEn: MOCK_SHIPPING_RETURN_POLICY.title.en,
      titleBn: MOCK_SHIPPING_RETURN_POLICY.title.bn ?? null,
      summaryEn: MOCK_SHIPPING_RETURN_POLICY.summary.en,
      summaryBn: MOCK_SHIPPING_RETURN_POLICY.summary.bn ?? null,
      sectionsEn: sectionsFor(MOCK_SHIPPING_RETURN_POLICY.sections, "en"),
      sectionsBn: sectionsFor(MOCK_SHIPPING_RETURN_POLICY.sections, "bn"),
      publishedAt: null,
    },
  ];

  for (const page of pages) {
    await prisma.page.upsert({
      where: { slug: page.slug },
      update: {},
      create: { ...page, lastUpdatedUserId: staffUserId },
    });
  }

  // --- menus ------------------------------------------------------------
  const menuItems = [
    { location: "HEADER" as const, labelEn: "Shop all", labelBn: "সব পণ্য", href: "/shop" },
    {
      location: "HEADER" as const,
      labelEn: "Formal shirts",
      labelBn: "ফরমাল শার্ট",
      href: "/category/formal-shirts",
    },
    {
      location: "HEADER" as const,
      labelEn: "Casual shirts",
      labelBn: "ক্যাজুয়াল শার্ট",
      href: "/category/casual-shirts",
    },
    {
      location: "HEADER" as const,
      labelEn: "Polo t-shirts",
      labelBn: "পোলো টি-শার্ট",
      href: "/category/polo-t-shirts",
    },
    {
      location: "HEADER" as const,
      labelEn: "Denim jeans",
      labelBn: "ডেনিম জিন্স",
      href: "/category/denim-jeans",
    },
    { location: "HEADER" as const, labelEn: "About", labelBn: "আমাদের সম্পর্কে", href: "/about" },
    { location: "HEADER" as const, labelEn: "Contact", labelBn: "যোগাযোগ", href: "/contact" },
    {
      location: "FOOTER" as const,
      labelEn: "Track order",
      labelBn: "অর্ডার ট্র্যাক",
      href: "/track-order",
    },
    { location: "FOOTER" as const, labelEn: "FAQ", labelBn: "সাধারণ জিজ্ঞাসা", href: "/faq" },
    {
      location: "FOOTER" as const,
      labelEn: "Shipping & returns",
      labelBn: "শিপিং ও রিটার্ন",
      href: "/shipping-returns",
    },
    {
      location: "FOOTER" as const,
      labelEn: "Privacy",
      labelBn: "প্রাইভেসি",
      href: "/privacy-policy",
    },
  ];

  if ((await prisma.menuItem.count()) === 0) {
    for (const [index, item] of menuItems.entries()) {
      await prisma.menuItem.create({ data: { ...item, sortOrder: index } });
    }
  }

  log("content", `banners, ${sections.length} home sections, ${pages.length} pages, menus`);
}

// ---------------------------------------------------------------------------
// 9. Sample orders — so the admin dashboard and account page have content
// ---------------------------------------------------------------------------

async function seedSampleOrders(staffUserId: string) {
  const warehouse = await prisma.location.findUnique({ where: { code: "WH-DHK" } });
  const gulshan = await prisma.location.findUnique({ where: { code: "BR-GUL" } });
  const insideDhaka = await prisma.shippingZone.findUnique({ where: { code: "inside_dhaka" } });
  if (warehouse === null || gulshan === null || insideDhaka === null) {
    throw new Error("[seed] locations or zones missing");
  }

  // A sample customer, matching the Phase 3 account screen.
  const customer = await prisma.user.upsert({
    where: { phone: "+8801712345678" },
    update: {},
    create: {
      phone: "+8801712345678",
      phoneVerifiedAt: new Date("2024-03-12T00:00:00+06:00"),
      name: "Imran Hossain",
      kind: "CUSTOMER",
      createdAt: new Date("2024-03-12T00:00:00+06:00"),
    },
  });

  // Create-only: the seed never deletes or replaces existing records.
  const existingAddresses = await prisma.address.count({ where: { userId: customer.id } });
  if (existingAddresses === 0)
    await prisma.address.createMany({
      data: [
        {
          userId: customer.id,
          label: "Home",
          fullName: "Imran Hossain",
          phone: "+8801712345678",
          line1: "House 42, Road 11",
          area: "Banani",
          city: "Dhaka",
          postcode: "1213",
          zoneId: insideDhaka.id,
          isDefault: true,
        },
        {
          userId: customer.id,
          label: "Office",
          fullName: "Imran Hossain",
          phone: "+8801712345678",
          line1: "Level 7, Placeholder Tower",
          area: "Tejgaon",
          city: "Dhaka",
          postcode: "1208",
          zoneId: insideDhaka.id,
          isDefault: false,
        },
      ],
    });

  const welcomeCoupon = await prisma.coupon.findUnique({ where: { code: "WELCOME10" } });

  for (const mockOrder of MOCK_ORDERS) {
    const alreadySeeded = await prisma.order.findUnique({
      where: { orderNumber: mockOrder.orderNumber },
    });
    if (alreadySeeded !== null) continue;

    const location = mockOrder.channel === "STORE" ? gulshan : warehouse;

    // Resolve each mock line to a real variant (first colour of that size).
    const items = [];
    for (const item of mockOrder.items) {
      const variant = await prisma.productVariant.findFirst({
        where: {
          sku: { startsWith: `${item.sku}-${item.size}-` },
        },
        orderBy: { sku: "asc" },
      });

      items.push({
        variantId: variant?.id ?? null,
        productNameEn: item.name.en,
        productNameBn: item.name.bn ?? null,
        variantLabel: `${item.size} / ${item.colour.en}`,
        sku: variant?.sku ?? item.sku,
        imageUrl: item.image,
        unitPricePoisha: item.unitPricePoisha,
        quantity: item.quantity,
        lineTotalPoisha: item.unitPricePoisha * item.quantity,
      });
    }

    const order = await prisma.order.create({
      data: {
        orderNumber: mockOrder.orderNumber,
        channel: mockOrder.channel,
        locationId: location.id,
        userId: customer.id,
        customerName: mockOrder.address.fullName,
        customerPhone: mockOrder.address.phone,
        status: mockOrder.status,
        paymentStatus: mockOrder.paymentStatus,
        subtotalPoisha: mockOrder.subtotalPoisha,
        discountPoisha: mockOrder.discountPoisha,
        shippingPoisha: mockOrder.shippingPoisha,
        totalPoisha: mockOrder.totalPoisha,
        couponId: mockOrder.couponCode === undefined ? null : (welcomeCoupon?.id ?? null),
        zoneId: insideDhaka.id,
        shipName: mockOrder.address.fullName,
        shipPhone: mockOrder.address.phone,
        shipLine1: mockOrder.address.line1.en,
        shipArea: mockOrder.address.area.en,
        shipCity: mockOrder.address.city.en,
        shipPostcode: mockOrder.address.postcode,
        soldByUserId: mockOrder.channel === "STORE" ? staffUserId : null,
        placedAt: new Date(mockOrder.placedAt),
        confirmedAt: new Date(mockOrder.placedAt),
        shippedAt: mockOrder.shipment === undefined ? null : new Date(mockOrder.placedAt),
        deliveredAt: mockOrder.status === "DELIVERED" ? new Date(mockOrder.placedAt) : null,
        items: { create: items },
        statusHistory: {
          create: mockOrder.timeline.map((event) => ({
            status: event.status,
            noteEn: event.note.en,
            noteBn: event.note.bn ?? null,
            userId: staffUserId,
            createdAt: new Date(event.at),
          })),
        },
        payments: {
          create: {
            provider: mockOrder.paymentMethod,
            mode: mockOrder.paymentMethod === "SSLCOMMERZ" ? "SANDBOX" : "MOCK",
            status: mockOrder.paymentStatus,
            amountPoisha: mockOrder.totalPoisha,
            providerTransactionId:
              mockOrder.paymentStatus === "PAID" ? `SEED-${mockOrder.orderNumber}` : null,
            paidAt: mockOrder.paymentStatus === "PAID" ? new Date(mockOrder.placedAt) : null,
          },
        },
      },
      include: { items: true },
    });

    // Coupon redemption, written the way the order service will write it.
    if (mockOrder.couponCode !== undefined && welcomeCoupon !== null) {
      await prisma.couponRedemption.create({
        data: {
          couponId: welcomeCoupon.id,
          orderId: order.id,
          userId: customer.id,
          customerPhone: mockOrder.address.phone,
          discountPoisha: mockOrder.discountPoisha,
        },
      });
      await prisma.coupon.update({
        where: { id: welcomeCoupon.id },
        data: { usedCount: { increment: 1 } },
      });
    }

    // Shipment plus its events.
    if (mockOrder.shipment !== undefined) {
      await prisma.shipment.create({
        data: {
          orderId: order.id,
          courier: "STEADFAST",
          mode: "MOCK",
          status: mockOrder.status === "DELIVERED" ? "DELIVERED" : "IN_TRANSIT",
          consignmentId: mockOrder.shipment.consignmentId,
          codAmountPoisha: mockOrder.paymentMethod === "COD" ? mockOrder.totalPoisha : 0,
          fromLocationId: location.id,
          bookedAt: new Date(mockOrder.placedAt),
          deliveredAt: mockOrder.status === "DELIVERED" ? new Date(mockOrder.placedAt) : null,
          events: {
            create: mockOrder.timeline
              .filter((event) => event.status === "SHIPPED" || event.status === "DELIVERED")
              .map((event) => ({
                status:
                  event.status === "DELIVERED" ? ("DELIVERED" as const) : ("IN_TRANSIT" as const),
                note: event.note.en,
                source: "seed",
                occurredAt: new Date(event.at),
              })),
          },
        },
      });
    }

    // Stock actually left the shelf for shipped and delivered orders, so the
    // ledger and the stock levels stay consistent with the order history.
    const movementType = mockOrder.channel === "STORE" ? "SALE_STORE" : "SALE_ONLINE";
    for (const item of order.items) {
      if (item.variantId === null) continue;

      await prisma.inventoryMovement.create({
        data: {
          variantId: item.variantId,
          locationId: location.id,
          type: movementType,
          quantity: -item.quantity,
          reason: `Sample order ${order.orderNumber}`,
          referenceType: "ORDER",
          referenceId: order.id,
          userId: staffUserId,
        },
      });

      await prisma.inventoryLevel.updateMany({
        where: {
          variantId: item.variantId,
          locationId: location.id,
          onHand: { gte: item.quantity },
        },
        data: { onHand: { decrement: item.quantity } },
      });
    }
  }

  // Continue the order sequence after the sample orders.
  await prisma.$executeRawUnsafe(`SELECT setval('order_number_seq', ${MOCK_ORDERS.length}, true)`);

  log("sample orders", `${MOCK_ORDERS.length} orders with items, payments and ledger entries`);
}

// ---------------------------------------------------------------------------
// run
// ---------------------------------------------------------------------------

async function main() {
  console.info("\nSeeding US Export House development database\n");

  await seedSettings();
  await seedOptionPresets();
  await seedShippingZones();
  await seedLocations();
  await seedRoles();
  const staffUserId = await seedStaff();

  // Give the seeded Super Admin explicit access to every location too, so the
  // Phase 5 location filter can be exercised either way.
  const locations = await prisma.location.findMany();
  for (const location of locations) {
    await prisma.staffLocationAccess.upsert({
      where: { userId_locationId: { userId: staffUserId, locationId: location.id } },
      update: {},
      create: { userId: staffUserId, locationId: location.id },
    });
  }

  const sizeCharts = await seedSizeCharts();
  const brandId = await seedBrand();
  const categoryIds = await seedCategories(sizeCharts);
  await seedProducts(categoryIds, brandId, sizeCharts, staffUserId);
  await seedCoupons();
  await seedReviews();
  await seedContent(staffUserId);
  await seedSampleOrders(staffUserId);

  console.info("\nDone.\n");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error("\n[seed] failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
