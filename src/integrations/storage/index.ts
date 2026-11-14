import "server-only";

import { env } from "@/config/env";
import { isAutomatedTestRun } from "@/config/env-rules";
import { CloudinaryStorageProvider } from "./cloudinary.storage";
import { LocalMockStorageProvider } from "./local-mock.storage";
import type { StorageProvider } from "./storage-provider";

export type { StorageProvider, StoredImage, DirectUploadTicket } from "./storage-provider";

/**
 * The configured storage provider. env.ts already refuses STORAGE_PROVIDER=local
 * outside automated test runs; this factory repeats the check so the mock can
 * never be constructed in a real environment, even if env.ts were bypassed.
 */
let instance: StorageProvider | undefined;

export function getStorageProvider(): StorageProvider {
  if (instance !== undefined) return instance;

  if (env.STORAGE_PROVIDER === "cloudinary") {
    instance = new CloudinaryStorageProvider({
      cloudName: env.CLOUDINARY_CLOUD_NAME ?? "",
      apiKey: env.CLOUDINARY_API_KEY ?? "",
      apiSecret: env.CLOUDINARY_API_SECRET ?? "",
    });
    return instance;
  }

  if (env.APP_ENV === "production" || !isAutomatedTestRun(env)) {
    throw new Error("[storage] The mock storage provider runs only in automated tests.");
  }
  instance = new LocalMockStorageProvider();
  return instance;
}

/** For the admin badge and the health endpoint. */
export function isMockStorage(): boolean {
  return env.STORAGE_PROVIDER !== "cloudinary";
}
