import "server-only";

import { randomBytes } from "node:crypto";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  STORAGE_EXTENSION,
  type DirectUploadTicket,
  type ImageFormat,
  type StorageProvider,
  type StoredFileFacts,
  type StoredImage,
} from "./storage-provider";

/**
 * MOCK STORAGE — development and tests only.
 *
 * Files are written to public/uploads-dev/ (git-ignored) under a random,
 * server-generated name, and served by /api/dev-uploads/[file] (a route, not
 * the static public folder, because `next start` only serves public files that
 * existed at build time). The factory refuses this provider when
 * APP_ENV=production, and the admin shows a "MOCK STORAGE" badge.
 */

export const MOCK_UPLOAD_DIR = join(process.cwd(), "public", "uploads-dev");
export const MOCK_UPLOAD_ROUTE = "/api/dev-uploads";

/** Mock keys are a random hex name plus an allowed extension — nothing else. */
const MOCK_KEY_PATTERN = /^[a-f0-9]{32}\.(jpg|png|webp|avif)$/;

export function isMockKey(key: string): boolean {
  return MOCK_KEY_PATTERN.test(key);
}

export class LocalMockStorageProvider implements StorageProvider {
  readonly name = "local-mock" as const;
  readonly isMock = true;

  createDirectUpload(): DirectUploadTicket {
    return { kind: "server", uploadUrl: "/api/admin/uploads/mock" };
  }

  async upload(input: { bytes: Uint8Array; format: ImageFormat }): Promise<StoredImage> {
    const key = `${randomBytes(16).toString("hex")}.${STORAGE_EXTENSION[input.format]}`;
    await mkdir(MOCK_UPLOAD_DIR, { recursive: true });
    await writeFile(join(MOCK_UPLOAD_DIR, key), input.bytes, { flag: "wx" });
    return {
      provider: this.name,
      key,
      url: this.getUrl(key),
      width: null,
      height: null,
      bytes: input.bytes.length,
      format: input.format,
    };
  }

  async inspect(key: string): Promise<StoredFileFacts | null> {
    if (!isMockKey(key)) return null;
    try {
      // The mock only ever writes files it has already validated, under an
      // extension chosen from the detected format.
      const info = await stat(join(MOCK_UPLOAD_DIR, key));
      const extension = key.split(".").pop() ?? "";
      return { format: extension, bytes: info.size, width: null, height: null };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    if (!isMockKey(key)) return;
    try {
      await unlink(join(MOCK_UPLOAD_DIR, key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  getUrl(key: string): string {
    return `${MOCK_UPLOAD_ROUTE}/${key}`;
  }
}

/** Reads a mock file for the dev-uploads route. */
export async function readMockUpload(key: string): Promise<Buffer | null> {
  if (!isMockKey(key)) return null;
  try {
    return await readFile(join(MOCK_UPLOAD_DIR, key));
  } catch {
    return null;
  }
}
