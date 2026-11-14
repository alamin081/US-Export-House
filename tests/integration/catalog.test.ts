import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { MOCK_UPLOAD_DIR } from "@/integrations/storage/local-mock.storage";
import type { StaffContext } from "@/modules/access/authorization";
import { SYSTEM_ROLES } from "@/modules/access/permissions";
import { AUDIT_ACTIONS } from "@/modules/audit/audit-actions";
import { saveProductGraph } from "@/modules/catalog/catalog.repository";
import {
  changeProductStatus,
  createProductDraft,
  deleteProduct,
  getProductForEdit,
  listProductsForAdmin,
  saveProduct,
  saveProductCopy,
} from "@/modules/catalog/product.service";
import { getListing, getProductPage } from "@/modules/catalog/storefront-catalog.service";
import {
  deleteCategory,
  moveCategoryInOrder,
  saveCategory,
  saveTag,
} from "@/modules/catalog/taxonomy.service";
import { uploadMockImage, type UploadedImage } from "@/modules/media/media.service";

/**
 * Catalogue against the real test database: the product + variant
 * transaction, uniqueness, order history protection, optimistic locking,
 * permissions, category rules, search in three scripts and storefront
 * visibility. Every record carries a per-run prefix; nothing pre-existing is
 * modified.
 */

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const META = { ip: "198.51.100.7", userAgent: "catalog-integration" };
// 1x1 transparent PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

let counter = 0;
const slug = (label: string) => `it-${RUN}-${label}-${(counter += 1)}`;

async function actor(
  roleName: string,
  permissions?: StaffContext["permissions"],
): Promise<StaffContext> {
  const definition = SYSTEM_ROLES.find((role) => role.name === roleName);
  if (definition === undefined) throw new Error(roleName);
  const role = await db.role.findFirstOrThrow({ where: { name: roleName } });
  const user = await db.user.create({
    data: {
      kind: "STAFF",
      email: `cat-${RUN}-${(counter += 1)}@test.local`,
      name: roleName,
      roleId: role.id,
    },
  });
  return {
    userId: user.id,
    email: user.email ?? "",
    name: user.name,
    roleId: role.id,
    roleName,
    permissions: permissions ?? definition.permissions,
    allLocations: true,
    locationIds: [],
    sessionId: "integration",
    sessionExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  };
}

async function freeCategoryCode(): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const code = Array.from({ length: 4 }, () =>
      String.fromCharCode(65 + Math.floor(Math.random() * 26)),
    ).join("");
    if ((await db.category.findFirst({ where: { code } })) === null) return code;
  }
  throw new Error("no free category code");
}

async function expectAppError(promise: Promise<unknown>, code: string) {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(AppError);
  expect((caught as AppError).code).toBe(code);
  return caught as AppError;
}

function fieldErrors(error: AppError): Record<string, string> {
  return (error.details?.fieldErrors ?? {}) as Record<string, string>;
}

let manager: StaffContext;
let categoryId: string;
let categoryCode: string;
const preset: Record<string, string> = {};
const uploadedKeys: string[] = [];

async function upload(): Promise<UploadedImage> {
  const image = await uploadMockImage(
    manager,
    { declaredMime: "image/png", bytes: new Uint8Array(PNG) },
    META,
  );
  uploadedKeys.push(image.key);
  return image;
}

/** A complete, publishable product payload: 2 sizes x 1 colour, one image. */
async function productPayload(overrides: Record<string, unknown> = {}) {
  return {
    nameEn: `Navy Oxford ${RUN}`,
    nameBn: "নেভি অক্সফোর্ড",
    slug: slug("oxford"),
    categoryId,
    sizes: [{ ref: `preset:${preset.L}` }, { ref: `preset:${preset.M}` }],
    colours: [{ ref: `preset:${preset.NVY}` }],
    variants: [
      {
        sizeRef: `preset:${preset.L}`,
        colourRef: `preset:${preset.NVY}`,
        sku: "",
        price: "2490",
        comparePrice: "2990",
        isActive: true,
      },
      {
        sizeRef: `preset:${preset.M}`,
        colourRef: `preset:${preset.NVY}`,
        sku: "",
        price: "2490",
        comparePrice: "",
        isActive: true,
      },
    ],
    images: [{ upload: await upload(), altEn: "Navy oxford", altBn: "নেভি অক্সফোর্ড" }],
    ...overrides,
  };
}

beforeAll(async () => {
  manager = await actor("Store Manager");
  categoryCode = await freeCategoryCode();
  const category = await saveCategory(
    manager,
    { slug: slug("cat"), code: categoryCode, nameEn: `IT Category ${RUN}`, nameBn: "পরীক্ষা" },
    META,
  );
  categoryId = category.id;

  const presets = await db.optionPreset.findMany({
    where: {
      OR: [
        { group: "apparel", code: { in: ["L", "M", "S"] } },
        { group: "colour", code: { in: ["NVY", "WHT"] } },
      ],
    },
  });
  for (const row of presets) preset[row.code] = row.id;
  expect(Object.keys(preset).sort()).toEqual(["L", "M", "NVY", "S", "WHT"]);
});

afterAll(async () => {
  const { unlink } = await import("node:fs/promises");
  await Promise.all(
    uploadedKeys.map((key) => unlink(join(MOCK_UPLOAD_DIR, key)).catch(() => undefined)),
  );
  await db.$disconnect();
});

// ---------------------------------------------------------------------------

describe("saving a product with its variants", () => {
  it("creates product, options, variants and images together, with codes and SKUs from the pattern", async () => {
    const saved = await saveProduct(manager, await productPayload(), META);
    const product = await db.product.findUniqueOrThrow({
      where: { id: saved.id },
      include: { variants: true, images: true, options: { include: { values: true } } },
    });

    expect(product.status).toBe("DRAFT");
    expect(product.code).toMatch(new RegExp(`^UEH-${categoryCode}\\d{4}$`));
    expect(product.variants.map((variant) => variant.sku).sort()).toEqual(
      [`${product.code}-NVY-L`, `${product.code}-NVY-M`].sort(),
    );
    expect(
      product.variants.every(
        (variant) => variant.optionKey !== null && variant.optionKey.includes("+"),
      ),
    ).toBe(true);
    expect(product.variants.find((variant) => variant.sku.endsWith("-L"))?.comparePricePoisha).toBe(
      299_000,
    );
    expect(product.images).toHaveLength(1);
    expect(product.images[0]?.storageProvider).toBe("local-mock");
    expect(
      product.options.flatMap((option) => option.values).every((value) => value.presetId !== null),
    ).toBe(true);

    expect(
      await db.auditLog.count({
        where: { action: AUDIT_ACTIONS.productCreated, entityId: saved.id },
      }),
    ).toBe(1);
  });

  it("saves nothing when the transaction fails half-way", async () => {
    const takenSku = (await db.productVariant.findFirstOrThrow({ select: { sku: true } })).sku;
    const failingSlug = slug("rollback");
    const sizeL = await db.optionPreset.findUniqueOrThrow({ where: { id: preset.L } });

    await expect(
      saveProductGraph({
        newProductCode: { prefix: "UEH", categoryCode },
        skuPattern: "{PRODUCT_CODE}-{COLOUR}-{SIZE}",
        scalars: {
          slug: failingSlug,
          nameEn: "Rollback test",
          nameBn: null,
          summaryEn: null,
          summaryBn: null,
          descriptionEn: null,
          descriptionBn: null,
          fabricEn: null,
          fabricBn: null,
          careEn: null,
          careBn: null,
          categoryId,
          brandId: null,
          sizeChartId: null,
          fit: null,
          isNew: false,
          isFeatured: false,
          isBestseller: false,
          seoTitleEn: null,
          seoTitleBn: null,
          seoDescriptionEn: null,
          seoDescriptionBn: null,
        },
        extraCategoryIds: [],
        tagIds: [],
        optionValues: [
          {
            ref: "size-l",
            type: "SIZE",
            create: {
              valueEn: sizeL.valueEn,
              valueBn: null,
              hex: null,
              code: "L",
              presetId: sizeL.id,
              sortOrder: 0,
            },
          },
        ],
        variants: [
          // The first variant is fine; the second reuses an existing SKU and fails.
          {
            sizeRef: "size-l",
            colourRef: null,
            sku: `RB-${RUN.toUpperCase()}`,
            skuParts: { size: "L", colour: null },
            barcode: null,
            pricePoisha: 1000,
            comparePricePoisha: null,
            weightGrams: null,
            isActive: true,
            labelEn: null,
            labelBn: null,
          },
          {
            sizeRef: null,
            colourRef: null,
            sku: takenSku,
            skuParts: { size: null, colour: null },
            barcode: null,
            pricePoisha: 1000,
            comparePricePoisha: null,
            weightGrams: null,
            isActive: true,
            labelEn: null,
            labelBn: null,
          },
        ],
        archiveVariantIds: [],
        images: [],
        removeImageIds: [],
      }),
    ).rejects.toThrow();

    expect(await db.product.findUnique({ where: { slug: failingSlug } })).toBeNull();
    expect(
      await db.productVariant.findUnique({ where: { sku: `RB-${RUN.toUpperCase()}` } }),
    ).toBeNull();
  });

  it("rejects a SKU used by another variant, naming the field", async () => {
    const takenSku = (await db.productVariant.findFirstOrThrow({ select: { sku: true } })).sku;
    const payload = await productPayload();
    payload.variants[1] = {
      ...(payload.variants[1] as object),
      sku: takenSku,
    } as (typeof payload.variants)[number];

    const error = await expectAppError(saveProduct(manager, payload, META), "VALIDATION_FAILED");
    expect(fieldErrors(error)["variants.1.sku"]).toMatch(/already used/);
    expect(await db.product.findUnique({ where: { slug: payload.slug } })).toBeNull();
  });

  it("rejects the same size and colour twice — in the service and in the database", async () => {
    const payload = await productPayload();
    payload.variants[1] = {
      ...(payload.variants[0] as object),
    } as (typeof payload.variants)[number];
    const error = await expectAppError(saveProduct(manager, payload, META), "VALIDATION_FAILED");
    expect(Object.values(fieldErrors(error)).join(" ")).toMatch(/same size and colour/);

    // Bypassing the service, the partial unique index still refuses it.
    const sizeL = await db.optionPreset.findUniqueOrThrow({ where: { id: preset.L } });
    const duplicateSlug = slug("dup-db");
    const variant = (sku: string) => ({
      sizeRef: "size-l",
      colourRef: null,
      sku,
      skuParts: { size: "L", colour: null },
      barcode: null,
      pricePoisha: 1000,
      comparePricePoisha: null,
      weightGrams: null,
      isActive: true,
      labelEn: null,
      labelBn: null,
    });
    await expect(
      saveProductGraph({
        newProductCode: { prefix: "UEH", categoryCode },
        skuPattern: "{PRODUCT_CODE}-{SIZE}",
        scalars: { ...(await scalarsFor(duplicateSlug)) },
        extraCategoryIds: [],
        tagIds: [],
        optionValues: [
          {
            ref: "size-l",
            type: "SIZE",
            create: {
              valueEn: sizeL.valueEn,
              valueBn: null,
              hex: null,
              code: "L",
              presetId: sizeL.id,
              sortOrder: 0,
            },
          },
        ],
        variants: [variant(`D1-${RUN.toUpperCase()}`), variant(`D2-${RUN.toUpperCase()}`)],
        archiveVariantIds: [],
        images: [],
        removeImageIds: [],
      }),
    ).rejects.toThrow();
    expect(await db.product.findUnique({ where: { slug: duplicateSlug } })).toBeNull();
  });

  it("rejects a compare-at price that is not above the price", async () => {
    const payload = await productPayload();
    payload.variants[0] = {
      ...(payload.variants[0] as object),
      comparePrice: "2000",
    } as (typeof payload.variants)[number];
    const error = await expectAppError(saveProduct(manager, payload, META), "VALIDATION_FAILED");
    expect(fieldErrors(error)["variants.0.comparePrice"]).toBeDefined();
  });

  it("refuses an image that was not uploaded through this server", async () => {
    const payload = await productPayload();
    const forged = {
      ...(payload.images[0]?.upload as UploadedImage),
      key: "0".repeat(32) + ".png",
    };
    payload.images = [{ upload: forged, altEn: "x", altBn: "x" }];
    const error = await expectAppError(saveProduct(manager, payload, META), "VALIDATION_FAILED");
    expect(fieldErrors(error)["images.0"]).toMatch(/could not be verified/);
  });
});

async function scalarsFor(productSlug: string) {
  return {
    slug: productSlug,
    nameEn: "Scalar product",
    nameBn: null,
    summaryEn: null,
    summaryBn: null,
    descriptionEn: null,
    descriptionBn: null,
    fabricEn: null,
    fabricBn: null,
    careEn: null,
    careBn: null,
    categoryId,
    brandId: null,
    sizeChartId: null,
    fit: null,
    isNew: false,
    isFeatured: false,
    isBestseller: false,
    seoTitleEn: null,
    seoTitleBn: null,
    seoDescriptionEn: null,
    seoDescriptionBn: null,
  };
}

/** Edit payload rebuilt from what the server returns, the way the admin form does it. */
async function editPayload(
  productId: string,
  change: (payload: Record<string, unknown>) => void = () => {},
) {
  const view = await getProductForEdit(manager, productId);
  const payload: Record<string, unknown> = {
    id: view.id,
    version: view.version,
    nameEn: view.nameEn,
    nameBn: view.nameBn,
    slug: view.slug,
    categoryId: view.categoryId,
    sizes: view.sizes.map((value) => ({ ref: value.id })),
    colours: view.colours.map((value) => ({ ref: value.id })),
    variants: view.variants.map((variant) => ({
      id: variant.id,
      sizeRef: variant.sizeRef,
      colourRef: variant.colourRef,
      sku: variant.sku,
      barcode: variant.barcode,
      price: String(variant.pricePoisha / 100),
      comparePrice:
        variant.comparePricePoisha === null ? "" : String(variant.comparePricePoisha / 100),
      isActive: variant.isActive,
    })),
    images: view.images.map((image) => ({
      id: image.id,
      altEn: image.altEn,
      altBn: image.altBn,
      colourRef: image.colourRef,
    })),
  };
  change(payload);
  return payload;
}

describe("concurrent edits (optimistic locking)", () => {
  it("refuses the second of two saves that started from the same version", async () => {
    const created = await saveProduct(manager, await productPayload(), META);
    const first = await editPayload(created.id, (payload) => (payload.nameEn = "Saved by staff A"));
    const second = await editPayload(
      created.id,
      (payload) => (payload.nameEn = "Saved by staff B"),
    );

    await saveProduct(manager, first, META);
    const error = await expectAppError(saveProduct(manager, second, META), "CONFLICT");
    expect(error.httpStatus).toBe(409);
    expect(error.message).toMatch(/someone else saved/i);

    const stored = await db.product.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.nameEn).toBe("Saved by staff A");
    expect(stored.version).toBe(1);
  });
});

describe("price changes", () => {
  it("are audited with the old and the new value", async () => {
    const created = await saveProduct(manager, await productPayload(), META);
    const edit = await editPayload(created.id, (payload) => {
      const variants = payload.variants as Array<Record<string, unknown>>;
      (variants[0] as Record<string, unknown>).price = "1990";
    });
    await saveProduct(manager, edit, META);

    const rows = await db.auditLog.findMany({
      where: { action: AUDIT_ACTIONS.priceChanged, entityId: created.id },
      orderBy: { createdAt: "asc" },
    });
    const last = rows.at(-1);
    expect(last?.before).toEqual([expect.objectContaining({ price: 249_000 })]);
    expect(last?.after).toEqual([expect.objectContaining({ price: 199_000 })]);
  });

  it("are refused for staff without catalog.price.write", async () => {
    const noPrice = await actor(
      "Store Manager",
      SYSTEM_ROLES.find((role) => role.name === "Store Manager")?.permissions.filter(
        (key) => key !== "catalog.price.write",
      ),
    );
    const created = await saveProduct(manager, await productPayload(), META);
    const edit = await editPayload(created.id, (payload) => {
      ((payload.variants as Array<Record<string, unknown>>)[0] as Record<string, unknown>).price =
        "999";
    });
    const error = await expectAppError(saveProduct(noPrice, edit, META), "VALIDATION_FAILED");
    expect(fieldErrors(error)["variants.0.price"]).toMatch(/permission/);
  });
});

describe("order history protection", () => {
  it("never deletes a product or variant that is on an order, only archives it", async () => {
    const created = await saveProduct(manager, await productPayload(), META);
    const variant = await db.productVariant.findFirstOrThrow({ where: { productId: created.id } });
    const location = await db.location.findFirstOrThrow();
    await db.order.create({
      data: {
        orderNumber: `IT-${RUN}-${(counter += 1)}`,
        locationId: location.id,
        customerName: "Integration Customer",
        customerPhone: "+8801700000000",
        subtotalPoisha: 249_000,
        totalPoisha: 249_000,
        items: {
          create: {
            variantId: variant.id,
            productNameEn: "Navy Oxford",
            sku: variant.sku,
            unitPricePoisha: 249_000,
            quantity: 1,
            lineTotalPoisha: 249_000,
          },
        },
      },
    });

    // The draft cannot be deleted any more.
    const error = await expectAppError(deleteProduct(manager, created.id, META), "CONFLICT");
    expect(error.message).toMatch(/archived/);

    // Removing the variant from the form archives it; the row stays for the order.
    const edit = await editPayload(created.id, (payload) => {
      payload.variants = (payload.variants as Array<{ id: string }>).filter(
        (row) => row.id !== variant.id,
      );
    });
    await saveProduct(manager, edit, META);
    const stored = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(stored.deletedAt).not.toBeNull();
    expect(stored.isActive).toBe(false);
    expect(await db.orderItem.count({ where: { variantId: variant.id } })).toBe(1);

    // Archiving the product itself is allowed.
    const [result] = await changeProductStatus(
      manager,
      { productIds: [created.id], status: "ARCHIVED" },
      META,
    );
    expect(result?.ok).toBe(true);
  });

  it("soft-deletes a draft that was never ordered, and removes its stored files", async () => {
    const created = await saveProduct(manager, await productPayload(), META);
    const image = await db.productImage.findFirstOrThrow({ where: { productId: created.id } });
    expect(existsSync(join(MOCK_UPLOAD_DIR, image.storageKey ?? ""))).toBe(true);

    await deleteProduct(manager, created.id, META);
    const stored = await db.product.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.deletedAt).not.toBeNull();
    expect(existsSync(join(MOCK_UPLOAD_DIR, image.storageKey ?? ""))).toBe(false);
  });
});

describe("publishing", () => {
  it("explains which requirements are missing, and publishes a complete product", async () => {
    const incomplete = await saveProduct(
      manager,
      await productPayload({ nameBn: "", images: [] }),
      META,
    );
    const complete = await saveProduct(manager, await productPayload(), META);

    const results = await changeProductStatus(
      manager,
      { productIds: [incomplete.id, complete.id], status: "PUBLISHED" },
      META,
    );
    const failed = results.find((result) => result.productId === incomplete.id);
    expect(failed?.ok).toBe(false);
    expect(failed?.missing).toEqual(["name_bn", "image"]);
    expect(failed?.reasons.join(" ")).toMatch(/Bengali name/);
    expect(results.find((result) => result.productId === complete.id)?.ok).toBe(true);

    const published = await db.product.findUniqueOrThrow({ where: { id: complete.id } });
    expect(published.status).toBe("PUBLISHED");
    expect(published.publishedAt).not.toBeNull();
    expect(
      await db.auditLog.count({
        where: { action: AUDIT_ACTIONS.productPublished, entityId: complete.id },
      }),
    ).toBe(1);
  });
});

describe("permissions (403)", () => {
  it("keeps every role inside its catalogue rights", async () => {
    const editor = await actor("Content Editor");
    const inventory = await actor("Inventory Staff");
    const sales = await actor("Branch Sales Staff");
    const created = await saveProduct(manager, await productPayload(), META);

    const forbidden = await expectAppError(
      saveProduct(editor, await productPayload(), META),
      "FORBIDDEN",
    );
    expect(forbidden.httpStatus).toBe(403);
    await expectAppError(
      changeProductStatus(inventory, { productIds: [created.id], status: "PUBLISHED" }, META),
      "FORBIDDEN",
    );
    await expectAppError(deleteProduct(sales, created.id, META), "FORBIDDEN");
    await expectAppError(
      saveCategory(editor, { slug: slug("nope"), nameEn: "Nope" }, META),
      "FORBIDDEN",
    );
    await expectAppError(
      uploadMockImage(inventory, { declaredMime: "image/png", bytes: new Uint8Array(PNG) }, META),
      "FORBIDDEN",
    );

    // Everyone with catalog.read can list.
    expect((await listProductsForAdmin(sales, {})).items.length).toBeGreaterThan(0);
  });

  it("lets a Content Editor create drafts and edit copy, but nothing else", async () => {
    const editor = await actor("Content Editor");
    const draft = await createProductDraft(
      editor,
      { nameEn: `Editor draft ${RUN}`, slug: slug("draft"), categoryId },
      META,
    );
    const view = await getProductForEdit(editor, draft.id);
    expect(view.status).toBe("DRAFT");
    expect(view.variants).toHaveLength(0);
    expect(view.code).toMatch(/^UEH-/);

    await saveProductCopy(
      editor,
      {
        id: draft.id,
        version: view.version,
        nameEn: `Editor draft ${RUN}`,
        nameBn: "সম্পাদকের খসড়া",
        seoTitleEn: "SEO title",
        images: [],
      },
      META,
    );
    const stored = await db.product.findUniqueOrThrow({ where: { id: draft.id } });
    expect(stored.nameBn).toBe("সম্পাদকের খসড়া");
    expect(stored.seoTitleEn).toBe("SEO title");
  });
});

describe("categories", () => {
  it("refuses cycles and trees deeper than the setting", async () => {
    const root = await saveCategory(manager, { slug: slug("root"), nameEn: "Men" }, META);
    const child = await saveCategory(
      manager,
      { slug: slug("child"), nameEn: "Shirts", parentId: root.id },
      META,
    );
    const grandchild = await saveCategory(
      manager,
      { slug: slug("leaf"), nameEn: "Formal", parentId: child.id },
      META,
    );

    const cycle = await expectAppError(
      saveCategory(
        manager,
        {
          id: root.id,
          slug: (await db.category.findUniqueOrThrow({ where: { id: root.id } })).slug,
          nameEn: "Men",
          parentId: grandchild.id,
        },
        META,
      ),
      "VALIDATION_FAILED",
    );
    expect(fieldErrors(cycle).parentId).toMatch(/own sub-categories/);

    const deep = await expectAppError(
      saveCategory(
        manager,
        { slug: slug("deep"), nameEn: "Too deep", parentId: grandchild.id },
        META,
      ),
      "VALIDATION_FAILED",
    );
    expect(fieldErrors(deep).parentId).toMatch(/deeper/);

    // A category with sub-categories or products cannot be deleted.
    await expectAppError(deleteCategory(manager, root.id, META), "CONFLICT");
    await expectAppError(deleteCategory(manager, categoryId, META), "CONFLICT");
    await deleteCategory(manager, grandchild.id, META);
    expect(
      (await db.category.findUniqueOrThrow({ where: { id: grandchild.id } })).deletedAt,
    ).not.toBeNull();
    expect(
      await db.auditLog.count({
        where: { action: AUDIT_ACTIONS.categoryDeleted, entityId: grandchild.id },
      }),
    ).toBe(1);
  });

  it("reorders siblings with up/down", async () => {
    const parent = await saveCategory(
      manager,
      { slug: slug("order"), nameEn: "Order parent" },
      META,
    );
    const first = await saveCategory(
      manager,
      { slug: slug("first"), nameEn: "First", parentId: parent.id },
      META,
    );
    const second = await saveCategory(
      manager,
      { slug: slug("second"), nameEn: "Second", parentId: parent.id },
      META,
    );

    await moveCategoryInOrder(manager, { categoryId: second.id, direction: "up" }, META);
    const order = await db.category.findMany({
      where: { parentId: parent.id },
      orderBy: { sortOrder: "asc" },
    });
    expect(order.map((row) => row.id)).toEqual([second.id, first.id]);
  });
});

describe("storefront", () => {
  it("shows published products only; drafts and archived products are not found", async () => {
    const created = await saveProduct(manager, await productPayload(), META);
    const productSlug = (await db.product.findUniqueOrThrow({ where: { id: created.id } })).slug;
    expect(await getProductPage(productSlug)).toBeNull();

    await changeProductStatus(manager, { productIds: [created.id], status: "PUBLISHED" }, META);
    const page = await getProductPage(productSlug);
    expect(page?.name).toEqual({ en: `Navy Oxford ${RUN}`, bn: "নেভি অক্সফোর্ড" });
    expect(page?.variants).toHaveLength(2);
    expect(page?.minPricePoisha).toBe(249_000);
    expect(page?.colours.map((colour) => colour.label.bn)).toEqual(["নেভি ব্লু"]);

    await changeProductStatus(manager, { productIds: [created.id], status: "ARCHIVED" }, META);
    expect(await getProductPage(productSlug)).toBeNull();
  });

  it("finds products in Bengali, English and Banglish, through names and tag spellings", async () => {
    const tag = await saveTag(
      manager,
      {
        slug: slug("panjabi"),
        nameEn: "Panjabi",
        nameBn: "পাঞ্জাবি",
        aliases: "punjabi, panjabee",
      },
      META,
    );
    const tagged = await saveProduct(
      manager,
      await productPayload({ nameEn: `Eid Kurta ${RUN}`, nameBn: "ঈদ কুর্তা", tagIds: [tag.id] }),
      META,
    );
    const untagged = await saveProduct(
      manager,
      await productPayload({ nameEn: `Plain Shirt ${RUN}`, nameBn: "সাধারণ শার্ট" }),
      META,
    );
    await changeProductStatus(
      manager,
      { productIds: [tagged.id, untagged.id], status: "PUBLISHED" },
      META,
    );

    const ids = async (q: string) =>
      (await getListing({ q }))?.products.map((product) => product.id) ?? [];

    for (const query of ["পাঞ্জাবি", "Panjabi", "punjabi", "PANJABEE", "কুর্তা", "eid kurta"]) {
      const found = await ids(query);
      expect(found, query).toContain(tagged.id);
      expect(found, query).not.toContain(untagged.id);
    }
    expect(await ids(`nothing-like-this-${RUN}`)).toEqual([]);
    // LIKE wildcards in a query are matched literally.
    expect(await ids("%")).not.toContain(tagged.id);
  });

  it("filters by size and colour and sorts by price", async () => {
    const cheap = await saveProduct(
      manager,
      await productPayload({
        nameEn: `Filter Cheap ${RUN}`,
        sizes: [{ ref: `preset:${preset.S}` }],
        colours: [{ ref: `preset:${preset.WHT}` }],
        variants: [
          {
            sizeRef: `preset:${preset.S}`,
            colourRef: `preset:${preset.WHT}`,
            sku: "",
            price: "990",
            comparePrice: "",
            isActive: true,
          },
        ],
      }),
      META,
    );
    const dear = await saveProduct(
      manager,
      await productPayload({ nameEn: `Filter Dear ${RUN}` }),
      META,
    );
    await changeProductStatus(
      manager,
      { productIds: [cheap.id, dear.id], status: "PUBLISHED" },
      META,
    );

    const category = await db.category.findUniqueOrThrow({ where: { id: categoryId } });
    const listing = await getListing({ categorySlug: category.slug, sort: "price-asc" });
    const order = listing?.products.map((product) => product.id) ?? [];
    expect(order.indexOf(cheap.id)).toBeLessThan(order.indexOf(dear.id));

    const white = await getListing({ categorySlug: category.slug, colours: ["White"] });
    expect(white?.products.map((product) => product.id)).toContain(cheap.id);
    expect(white?.products.map((product) => product.id)).not.toContain(dear.id);

    const priced = await getListing({ categorySlug: category.slug, minTaka: 2000 });
    expect(priced?.products.map((product) => product.id)).not.toContain(cheap.id);
    expect(listing?.facets.colours.map((colour) => colour.value)).toEqual(
      expect.arrayContaining(["White", "Navy Blue"]),
    );
  });
});

describe("uploads", () => {
  it("rejects a file that only pretends to be an image, and audits it", async () => {
    const script = new TextEncoder().encode("<?php echo 'x'; ?>");
    const error = await expectAppError(
      uploadMockImage(manager, { declaredMime: "image/png", bytes: script }, META),
      "VALIDATION_FAILED",
    );
    expect(error.message).toMatch(/JPEG, PNG, WebP/);
    expect(
      await db.auditLog.count({
        where: { action: AUDIT_ACTIONS.imageRejected, userId: manager.userId },
      }),
    ).toBeGreaterThan(0);
  });

  it("removes a stored file when its image is taken off the product", async () => {
    const created = await saveProduct(manager, await productPayload(), META);
    const image = await db.productImage.findFirstOrThrow({ where: { productId: created.id } });
    const path = join(MOCK_UPLOAD_DIR, image.storageKey ?? "");
    expect(existsSync(path)).toBe(true);

    await saveProduct(
      manager,
      await editPayload(created.id, (payload) => (payload.images = [])),
      META,
    );
    expect(await db.productImage.count({ where: { productId: created.id } })).toBe(0);
    expect(existsSync(path)).toBe(false);
  });
});
