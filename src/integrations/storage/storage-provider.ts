/**
 * Image storage behind one interface (spec: external services live in
 * src/integrations behind an interface). Two implementations:
 *
 *   CloudinaryStorageProvider  real storage; the browser uploads directly with
 *                              a server-made signature (API secret never leaves
 *                              the server), then the server inspects the result.
 *   LocalMockStorageProvider   development only; files land in
 *                              public/uploads-dev/ and the admin shows a
 *                              "MOCK STORAGE" badge. Refused in production.
 */

export type StorageProviderName = "cloudinary" | "local-mock";

/** Kept in step with ALLOWED_IMAGE_FORMATS in src/modules/media/image-validation.ts. */
export type ImageFormat = "jpeg" | "png" | "webp" | "avif";

export const STORAGE_MIME: Record<ImageFormat, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
};

export const STORAGE_EXTENSION: Record<ImageFormat, string> = {
  jpeg: "jpg",
  png: "png",
  webp: "webp",
  avif: "avif",
};

export interface ImageTransform {
  /** Longest side to deliver, in pixels. */
  width?: number;
}

export interface StoredImage {
  provider: StorageProviderName;
  /** Server-generated key: Cloudinary public_id or mock file name. */
  key: string;
  url: string;
  width: number | null;
  height: number | null;
  bytes: number;
  format: ImageFormat;
}

/** What the browser needs to upload a file. */
export type DirectUploadTicket =
  | {
      kind: "cloudinary";
      uploadUrl: string;
      /** Signed form fields to send with the file. Contains no secret. */
      fields: Record<string, string>;
      key: string;
    }
  | { kind: "server"; uploadUrl: string };

/** Facts the provider reports about a stored file. */
export interface StoredFileFacts {
  format: string;
  bytes: number;
  width: number | null;
  height: number | null;
}

export interface StorageProvider {
  readonly name: StorageProviderName;
  readonly isMock: boolean;

  /** Stores already-validated bytes under a fresh server-generated key. */
  upload(input: { bytes: Uint8Array; format: ImageFormat; folder: string }): Promise<StoredImage>;

  /** Removes a stored file. Resolves when the file is already gone. */
  delete(key: string): Promise<void>;

  /** Public URL, optionally resized by the provider. */
  getUrl(key: string, transform?: ImageTransform): string;

  /** Prepares a browser upload into `folder`. */
  createDirectUpload(folder: string): DirectUploadTicket;

  /** Reads back what was actually stored under `key`; null when missing. */
  inspect(key: string): Promise<StoredFileFacts | null>;
}
