import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/config/env";
import { AppError } from "@/lib/errors";
import { getStorageProvider, isMockStorage, type StoredImage } from "@/integrations/storage";
import type { DirectUploadTicket } from "@/integrations/storage/storage-provider";
import {
  assertPermission,
  hasAnyPermission,
  type StaffContext,
} from "@/modules/access/authorization";
import { AUDIT_ACTIONS, recordAudit, type RequestMeta } from "@/modules/audit/audit.service";
import { getCatalogSettings } from "@/modules/settings/settings.service";
import {
  IMAGE_PROBLEM_MESSAGES,
  validateImageUpload,
  validateStoredImage,
} from "./image-validation";

/**
 * Product image uploads.
 *
 * Flow (Cloudinary):
 *   1. createUploadTicket   server signs a direct upload to a server-chosen key
 *   2. browser              resizes to <= 2400 px and uploads straight to Cloudinary
 *   3. completeUpload       server asks Cloudinary what was stored, checks format
 *                           and size, deletes it if not allowed, and returns a
 *                           signed upload token
 *   4. product save         accepts an image only with a valid upload token
 *
 * Flow (mock): the browser posts the file to /api/admin/uploads/mock, which
 * checks MIME type and file signature before writing it (uploadMockImage).
 */

const PRODUCT_FOLDER = "products";
const TOKEN_TTL_MS = 6 * 60 * 60 * 1000;

function folder(): string {
  return `${env.CLOUDINARY_FOLDER}/${PRODUCT_FOLDER}`;
}

/** Uploading needs either full catalogue rights or copy rights. */
function assertCanUpload(actor: StaffContext): void {
  if (!hasAnyPermission(actor, ["catalog.write", "catalog.content"])) {
    assertPermission(actor, "catalog.write");
  }
}

export interface UploadedImage {
  provider: StoredImage["provider"];
  key: string;
  url: string;
  width: number | null;
  height: number | null;
  bytes: number;
  format: string;
  /** HMAC over the fields above; required to attach the image to a product. */
  token: string;
}

function tokenPayload(image: Omit<UploadedImage, "token">, expiresAt: number): string {
  return JSON.stringify([
    image.provider,
    image.key,
    image.url,
    image.bytes,
    image.format,
    expiresAt,
  ]);
}

function sign(payload: string): string {
  return createHmac("sha256", `upload-token:${env.AUTH_SECRET}`)
    .update(payload)
    .digest("base64url");
}

export function issueUploadToken(image: Omit<UploadedImage, "token">, now = Date.now()): string {
  const expiresAt = now + TOKEN_TTL_MS;
  return `${expiresAt}.${sign(tokenPayload(image, expiresAt))}`;
}

/** True when the token was issued by this server for exactly this image. */
export function verifyUploadToken(image: UploadedImage, now = Date.now()): boolean {
  const [expiresRaw, signature] = image.token.split(".");
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < now || signature === undefined) return false;
  const { token: _token, ...rest } = image;
  const expected = Buffer.from(sign(tokenPayload(rest, expiresAt)));
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function withToken(stored: StoredImage): UploadedImage {
  const image = {
    provider: stored.provider,
    key: stored.key,
    url: stored.url,
    width: stored.width,
    height: stored.height,
    bytes: stored.bytes,
    format: stored.format,
  };
  return { ...image, token: issueUploadToken(image) };
}

export interface UploadTicketResponse {
  ticket: DirectUploadTicket;
  maxBytes: number;
  maxEdgePx: number;
  mock: boolean;
}

export async function createUploadTicket(actor: StaffContext): Promise<UploadTicketResponse> {
  assertCanUpload(actor);
  const settings = await getCatalogSettings();
  return {
    ticket: getStorageProvider().createDirectUpload(folder()),
    maxBytes: settings.maxUploadBytes,
    maxEdgePx: settings.maxImageEdgePx,
    mock: isMockStorage(),
  };
}

function rejected(problem: keyof typeof IMAGE_PROBLEM_MESSAGES): AppError {
  return new AppError("VALIDATION_FAILED", IMAGE_PROBLEM_MESSAGES[problem], {
    details: { field: "file", problem },
  });
}

/** Mock provider: validates on the server, then stores. */
export async function uploadMockImage(
  actor: StaffContext,
  file: { declaredMime: string; bytes: Uint8Array },
  meta: RequestMeta,
): Promise<UploadedImage> {
  assertCanUpload(actor);
  const provider = getStorageProvider();
  if (!provider.isMock) {
    throw new AppError("FORBIDDEN", "Direct server uploads are only used with mock storage.");
  }

  const settings = await getCatalogSettings();
  const check = validateImageUpload({ ...file, maxBytes: settings.maxUploadBytes });
  if (!check.ok) {
    await recordAudit({
      actorUserId: actor.userId,
      action: AUDIT_ACTIONS.imageRejected,
      entityType: "image",
      after: { problem: check.problem, bytes: file.bytes.length, provider: provider.name },
      meta,
    });
    throw rejected(check.problem);
  }

  const stored = await provider.upload({
    bytes: file.bytes,
    format: check.format,
    folder: folder(),
  });
  await recordAudit({
    actorUserId: actor.userId,
    action: AUDIT_ACTIONS.imageUploaded,
    entityType: "image",
    entityId: stored.key,
    after: { provider: stored.provider, bytes: stored.bytes, format: stored.format },
    meta,
  });
  return withToken(stored);
}

/** Cloudinary: inspect what the browser uploaded and keep it only if allowed. */
export async function completeDirectUpload(
  actor: StaffContext,
  input: { key: string; width?: number | null; height?: number | null },
  meta: RequestMeta,
): Promise<UploadedImage> {
  assertCanUpload(actor);
  const provider = getStorageProvider();
  if (provider.isMock)
    throw new AppError("FORBIDDEN", "Mock storage uploads go through the server.");
  if (!input.key.startsWith(`${folder()}/`) || !/^[a-z0-9_/-]+$/.test(input.key)) {
    throw rejected("unsupported_type");
  }

  const facts = await provider.inspect(input.key);
  if (facts === null) throw new AppError("NOT_FOUND", "The uploaded image was not found.");

  const settings = await getCatalogSettings();
  const check = validateStoredImage({
    providerFormat: facts.format,
    bytes: facts.bytes,
    maxBytes: settings.maxUploadBytes,
  });
  if (!check.ok) {
    await deleteStoredFiles([{ provider: provider.name, key: input.key }]);
    await recordAudit({
      actorUserId: actor.userId,
      action: AUDIT_ACTIONS.imageRejected,
      entityType: "image",
      entityId: input.key,
      after: { problem: check.problem, bytes: facts.bytes, format: facts.format },
      meta,
    });
    throw rejected(check.problem);
  }

  const stored: StoredImage = {
    provider: provider.name,
    key: input.key,
    url: provider.getUrl(input.key),
    width: facts.width,
    height: facts.height,
    bytes: facts.bytes,
    format: check.format,
  };
  await recordAudit({
    actorUserId: actor.userId,
    action: AUDIT_ACTIONS.imageUploaded,
    entityType: "image",
    entityId: stored.key,
    after: { provider: stored.provider, bytes: stored.bytes, format: stored.format },
    meta,
  });
  return withToken(stored);
}

/**
 * Best-effort removal from storage after the database no longer needs the
 * files. Failures are logged and never undo or block the database change.
 * Files without a provider (static seed placeholders) are skipped.
 */
export async function deleteStoredFiles(
  files: ReadonlyArray<{ provider: string | null; key: string | null }>,
): Promise<{ deleted: number; failed: number }> {
  const provider = getStorageProvider();
  let deleted = 0;
  let failed = 0;
  for (const file of files) {
    if (file.key === null || file.provider !== provider.name) continue;
    try {
      await provider.delete(file.key);
      deleted += 1;
    } catch (error) {
      failed += 1;
      console.error(
        `[storage] could not delete ${file.provider}:${file.key}`,
        error instanceof Error ? error.message : "",
      );
    }
  }
  return { deleted, failed };
}
