import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type * as StorageModule from "@/integrations/storage";
import type * as DbModule from "@/lib/db";
import type { StaffContext } from "@/modules/access/authorization";
import type * as ProductModule from "@/modules/catalog/product.service";
import type * as MediaModule from "@/modules/media/media.service";
import { SYSTEM_ROLES } from "@/modules/access/permissions";

/**
 * LIVE Cloudinary check, against the real account in .env.local. Skipped
 * unless CLOUDINARY_LIVE_TEST=1 (it uploads to and deletes from the account):
 *
 *   CLOUDINARY_LIVE_TEST=1 npx vitest run --config vitest.integration.config.mts tests/integration/cloudinary.live.test.ts
 *
 * The real app flow: signed direct upload -> server-side format/size check ->
 * attached to a product -> the storefront serves a res.cloudinary.com URL ->
 * removing the image deletes it from Cloudinary. A forbidden format is refused.
 * Every test image is deleted at the end. No credential value is printed.
 */

const LIVE = process.env.CLOUDINARY_LIVE_TEST === "1";
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const META = { ip: "198.51.100.11", userAgent: "cloudinary-live" };

// A real 8x8 PNG (Cloudinary rejects some degenerate 1x1 files).
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDK+mmyAAAAABJRU5ErkJggg==",
  "base64",
);
// A 1x1 GIF: not an allowed format.
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

type Media = typeof MediaModule;
type Products = typeof ProductModule;
type Storage = typeof StorageModule;

let media: Media;
let products: Products;
let storage: Storage;
let db: (typeof DbModule)["db"];
let manager: StaffContext;
const cleanup: string[] = [];

async function uploadDirect(
  fields: Record<string, string>,
  url: string,
  bytes: Buffer,
  mime: string,
) {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(name, value);
  form.set("file", new Blob([new Uint8Array(bytes)], { type: mime }), "upload");
  return fetch(url, { method: "POST", body: form });
}

/** A category code (2-4 capitals) no other category uses; products need one. */
async function freeCode(): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const code = Array.from({ length: 4 }, () =>
      String.fromCharCode(65 + Math.floor(Math.random() * 26)),
    ).join("");
    if ((await db.category.findFirst({ where: { code } })) === null) return code;
  }
  throw new Error("no free category code");
}

describe.skipIf(!LIVE)("Cloudinary (live)", () => {
  beforeAll(async () => {
    // The integration setup forces mock storage; this file alone uses the real one.
    process.env.STORAGE_PROVIDER = "cloudinary";
    media = await import("@/modules/media/media.service");
    products = await import("@/modules/catalog/product.service");
    storage = await import("@/integrations/storage");
    db = (await import("@/lib/db")).db;
    expect(storage.isMockStorage()).toBe(false);

    const role = await db.role.findFirstOrThrow({ where: { name: "Store Manager" } });
    const user = await db.user.create({
      data: {
        kind: "STAFF",
        email: `cld-${RUN}@test.local`,
        name: "Cloudinary live",
        roleId: role.id,
      },
    });
    manager = {
      userId: user.id,
      email: user.email ?? "",
      name: user.name,
      roleId: role.id,
      roleName: role.name,
      permissions: [...(SYSTEM_ROLES.find((r) => r.name === "Store Manager")?.permissions ?? [])],
      allLocations: true,
      locationIds: [],
      sessionId: "live",
      sessionExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    };
  });

  afterAll(async () => {
    // Remove every test image that is still on Cloudinary.
    if (storage !== undefined) {
      const provider = storage.getStorageProvider();
      for (const key of cleanup) await provider.delete(key).catch(() => undefined);
      for (const key of cleanup) expect(await provider.inspect(key)).toBeNull();
    }
    await db?.$disconnect();
  });

  it("signs a direct upload without exposing the secret, into ueh/dev", async () => {
    const { ticket } = await media.createUploadTicket(manager);
    expect(ticket.kind).toBe("cloudinary");
    if (ticket.kind !== "cloudinary") return;
    expect(ticket.key.startsWith("ueh/dev/products/")).toBe(true);
    expect(ticket.fields.signature).toMatch(/^[a-f0-9]{40}$/);
    const secret = process.env.CLOUDINARY_API_SECRET ?? "";
    expect(secret.length).toBeGreaterThan(0);
    expect(JSON.stringify(ticket).includes(secret)).toBe(false);
  });

  it("uploads, verifies on the server, attaches to a product, shows it on the storefront and deletes it", async () => {
    const { ticket } = await media.createUploadTicket(manager);
    if (ticket.kind !== "cloudinary") throw new Error("expected a Cloudinary ticket");
    const response = await uploadDirect(ticket.fields, ticket.uploadUrl, PNG, "image/png");
    expect(response.status).toBe(200);
    cleanup.push(ticket.key);

    const uploaded = await media.completeDirectUpload(manager, { key: ticket.key }, META);
    expect(uploaded.provider).toBe("cloudinary");
    expect(uploaded.format).toBe("png");
    expect(
      uploaded.url.startsWith(
        `https://res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload/`,
      ),
    ).toBe(true);

    // Attach to a new published product.
    const category = await db.category.create({
      data: { slug: `cld-${RUN}`, nameEn: `Cloudinary ${RUN}`, code: await freeCode() },
    });
    const sizeL = await db.optionPreset.findFirstOrThrow({
      where: { group: "apparel", code: "L" },
    });
    const navy = await db.optionPreset.findFirstOrThrow({
      where: { group: "colour", code: "NVY" },
    });
    const slug = `cld-live-${RUN}`;
    const saved = await products.saveProduct(
      manager,
      {
        nameEn: `Cloudinary Live ${RUN}`,
        nameBn: "ক্লাউডিনারি পরীক্ষা",
        slug,
        categoryId: category.id,
        sizes: [{ ref: `preset:${sizeL.id}` }],
        colours: [{ ref: `preset:${navy.id}` }],
        variants: [
          {
            sizeRef: `preset:${sizeL.id}`,
            colourRef: `preset:${navy.id}`,
            sku: "",
            price: "1990",
            comparePrice: "",
            isActive: true,
          },
        ],
        images: [{ upload: uploaded, altEn: "Live test", altBn: "পরীক্ষা" }],
      },
      META,
    );
    await products.changeProductStatus(
      manager,
      { productIds: [saved.id], status: "PUBLISHED" },
      META,
    );

    const { getProductPage } = await import("@/modules/catalog/storefront-catalog.service");
    const page = await getProductPage(slug);
    const imageUrl = page?.images[0]?.url ?? "";
    expect(imageUrl.startsWith("https://res.cloudinary.com/")).toBe(true);
    const delivered = await fetch(imageUrl);
    expect(delivered.status).toBe(200);
    expect(delivered.headers.get("content-type") ?? "").toMatch(/^image\//);

    // Removing the image from the product deletes it from Cloudinary.
    const view = await products.getProductForEdit(manager, saved.id);
    await products
      .saveProduct(
        manager,
        {
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
            comparePrice: "",
            isActive: variant.isActive,
          })),
          images: [],
        },
        META,
      )
      .catch(async (error: unknown) => {
        // A published product needs an image: archive it first, then remove.
        await products.changeProductStatus(
          manager,
          { productIds: [saved.id], status: "ARCHIVED" },
          META,
        );
        throw error;
      });
    expect(await storage.getStorageProvider().inspect(ticket.key)).toBeNull();
  });

  it("refuses a format that is not allowed (the signature restricts it)", async () => {
    const { ticket } = await media.createUploadTicket(manager);
    if (ticket.kind !== "cloudinary") throw new Error("expected a Cloudinary ticket");
    const response = await uploadDirect(ticket.fields, ticket.uploadUrl, GIF, "image/gif");
    expect(response.status).toBeGreaterThanOrEqual(400);
    cleanup.push(ticket.key);
    expect(await storage.getStorageProvider().inspect(ticket.key)).toBeNull();
  });

  it("refuses to complete an upload outside this environment's folder", async () => {
    await expect(
      media.completeDirectUpload(manager, { key: "ueh/prod/products/abc" }, META),
    ).rejects.toThrow();
  });
});
