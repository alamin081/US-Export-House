import "server-only";

import { z } from "zod";

import { AppError } from "@/lib/errors";
import { assertPermission, hasPermission, type StaffContext } from "@/modules/access/authorization";
import { AUDIT_ACTIONS, recordAudit, type RequestMeta } from "@/modules/audit/audit.service";
import { deleteStoredFiles, verifyUploadToken } from "@/modules/media/media.service";
import { getImportSettings } from "@/modules/settings/settings.service";
import { uploadedImageSchema } from "../catalog.schema";
import { missingForPublish } from "../publish-rules";
import {
  findProductImagesState,
  findProductsForImageMatching,
  findPublishRequests,
  writeBulkImages,
} from "./product-import.repository";
import type { ImageMatchProduct } from "./image-names";

/**
 * Bulk image upload (Phase 12): files are matched to products by name in the
 * browser, uploaded the usual way (resized, signed, straight to storage), and
 * attached here one product at a time — added after the existing images or
 * replacing them. Replaced files are removed from storage after the commit.
 */

export async function getBulkImageReferences(actor: StaffContext) {
  assertPermission(actor, "catalog.write");
  const [products, settings, requested] = await Promise.all([
    findProductsForImageMatching(),
    getImportSettings(),
    findPublishRequests(),
  ]);
  return {
    concurrency: settings.bulkConcurrency,
    canPublish: hasPermission(actor, "catalog.publish"),
    /** Products an import asked to publish (they lacked images then). */
    publishRequested: requested,
    products: products.map((product): ImageMatchProduct => ({
      id: product.id,
      code: product.code ?? "",
      nameEn: product.nameEn,
      status: product.status,
      imageCount: product._count.images,
      colours: product.options.flatMap((option) => option.values),
    })),
  };
}

const attachSchema = z.object({
  productId: z.string().min(1).max(40),
  mode: z.enum(["add", "replace"]),
  images: z
    .array(
      z.object({
        upload: uploadedImageSchema,
        colourId: z.string().min(1).max(40).nullable(),
        order: z.number().int().min(1).max(999),
      }),
    )
    .min(1)
    .max(50),
});

export async function attachBulkImages(actor: StaffContext, raw: unknown, meta: RequestMeta) {
  assertPermission(actor, "catalog.write");
  const parsed = attachSchema.safeParse(raw);
  if (!parsed.success) throw new AppError("VALIDATION_FAILED", "Check the images and try again.");
  const input = parsed.data;
  const product = await findProductImagesState(input.productId);
  if (product === null) throw new AppError("NOT_FOUND", "Product not found.");
  const colours = new Set(
    product.options.flatMap((option) => option.values.map((value) => value.id)),
  );
  for (const image of input.images) {
    if (!verifyUploadToken(image.upload)) {
      throw new AppError("VALIDATION_FAILED", "An upload could not be verified. Upload it again.");
    }
    if (image.colourId !== null && !colours.has(image.colourId)) {
      throw new AppError("VALIDATION_FAILED", "A colour is not on this product.");
    }
  }
  const ordered = [...input.images].sort(
    (a, b) => a.order - b.order || (a.colourId ?? "").localeCompare(b.colourId ?? ""),
  );
  const result = await writeBulkImages({
    productId: product.id,
    replace: input.mode === "replace",
    images: ordered.map((image) => ({
      url: image.upload.url,
      storageProvider: image.upload.provider,
      storageKey: image.upload.key,
      width: image.upload.width,
      height: image.upload.height,
      bytes: image.upload.bytes,
      format: image.upload.format,
      optionValueId: image.colourId,
      altEn: product.nameEn,
    })),
  });
  await recordAudit({
    actorUserId: actor.userId,
    action: AUDIT_ACTIONS.imagesBulk,
    entityType: "product",
    entityId: product.id,
    after: { mode: input.mode, added: ordered.length, removed: result.removed.length },
    meta,
  });
  // Storage clean-up never blocks or undoes the database change.
  if (result.removed.length > 0) {
    await deleteStoredFiles(
      result.removed.flatMap((image) =>
        image.storageProvider === null || image.storageKey === null
          ? []
          : [{ provider: image.storageProvider, key: image.storageKey }],
      ),
    );
  }
  const missing = missingForPublish({
    nameEn: product.nameEn,
    nameBn: product.nameBn,
    imageCount: result.count,
    variants: product.variants.map((variant) => ({ ...variant, deleted: false })),
  });
  return {
    productId: product.id,
    slug: product.slug,
    status: product.status,
    imageCount: result.count,
    publishable: product.status === "DRAFT" && missing.length === 0,
  };
}
