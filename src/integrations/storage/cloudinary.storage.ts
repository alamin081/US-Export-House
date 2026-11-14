import "server-only";

import { createHash, randomBytes } from "node:crypto";

import {
  STORAGE_MIME,
  type DirectUploadTicket,
  type ImageFormat,
  type ImageTransform,
  type StorageProvider,
  type StoredFileFacts,
  type StoredImage,
} from "./storage-provider";

/**
 * Cloudinary over its REST API (no SDK: signing is one SHA-1, and fewer
 * dependencies means less to audit).
 *
 * NOT YET TESTED AGAINST A REAL CLOUDINARY ACCOUNT — no credentials exist in
 * this environment. Unit tests cover the signing and URL building only.
 *
 * Signing (Cloudinary "authenticated requests"): sort the parameters, join as
 * `k=v&k=v`, append the API secret, SHA-1, hex. The secret itself is never
 * sent anywhere, and never reaches the browser.
 */

export interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

const API_BASE = "https://api.cloudinary.com/v1_1";
const DELIVERY_BASE = "https://res.cloudinary.com";
const ALLOWED_FORMATS = "jpg,png,webp,avif";

export function signCloudinaryParams(
  params: Record<string, string | number>,
  apiSecret: string,
): string {
  const payload = Object.keys(params)
    .filter((key) => params[key] !== "" && params[key] !== undefined)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return createHash("sha1")
    .update(payload + apiSecret)
    .digest("hex");
}

/** Builds a delivery URL; transforms are inserted after /image/upload/. */
export function cloudinaryUrl(cloudName: string, key: string, transform?: ImageTransform): string {
  const parts = ["f_auto", "q_auto"];
  if (transform?.width !== undefined) parts.unshift("c_limit", `w_${Math.round(transform.width)}`);
  return `${DELIVERY_BASE}/${cloudName}/image/upload/${parts.join(",")}/${key}`;
}

function newKey(folder: string): string {
  return `${folder}/${randomBytes(16).toString("hex")}`;
}

export class CloudinaryStorageProvider implements StorageProvider {
  readonly name = "cloudinary" as const;
  readonly isMock = false;

  constructor(private readonly config: CloudinaryConfig) {}

  private timestamp(): number {
    return Math.floor(Date.now() / 1000);
  }

  createDirectUpload(folder: string): DirectUploadTicket {
    const key = newKey(folder);
    const signed = {
      allowed_formats: ALLOWED_FORMATS,
      overwrite: "false",
      public_id: key,
      timestamp: this.timestamp(),
    };
    return {
      kind: "cloudinary",
      uploadUrl: `${API_BASE}/${this.config.cloudName}/image/upload`,
      key,
      fields: {
        ...Object.fromEntries(Object.entries(signed).map(([name, value]) => [name, String(value)])),
        api_key: this.config.apiKey,
        signature: signCloudinaryParams(signed, this.config.apiSecret),
      },
    };
  }

  async upload(input: {
    bytes: Uint8Array;
    format: ImageFormat;
    folder: string;
  }): Promise<StoredImage> {
    const ticket = this.createDirectUpload(input.folder);
    if (ticket.kind !== "cloudinary") throw new Error("unexpected ticket");

    const form = new FormData();
    for (const [name, value] of Object.entries(ticket.fields)) form.set(name, value);
    form.set(
      "file",
      new Blob([Buffer.from(input.bytes)], { type: STORAGE_MIME[input.format] }),
      "upload",
    );

    const response = await fetch(ticket.uploadUrl, { method: "POST", body: form });
    if (!response.ok) throw new Error(`Cloudinary upload failed (${response.status})`);
    const body = (await response.json()) as {
      public_id: string;
      bytes: number;
      width?: number;
      height?: number;
    };

    return {
      provider: this.name,
      key: body.public_id,
      url: this.getUrl(body.public_id),
      width: body.width ?? null,
      height: body.height ?? null,
      bytes: body.bytes,
      format: input.format,
    };
  }

  async inspect(key: string): Promise<StoredFileFacts | null> {
    const auth = Buffer.from(`${this.config.apiKey}:${this.config.apiSecret}`).toString("base64");
    const response = await fetch(
      `${API_BASE}/${this.config.cloudName}/resources/image/upload/${key}`,
      { headers: { authorization: `Basic ${auth}` }, cache: "no-store" },
    );
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Cloudinary inspect failed (${response.status})`);
    const body = (await response.json()) as {
      format: string;
      bytes: number;
      width?: number;
      height?: number;
    };
    return {
      format: body.format,
      bytes: body.bytes,
      width: body.width ?? null,
      height: body.height ?? null,
    };
  }

  async delete(key: string): Promise<void> {
    const params = { invalidate: "true", public_id: key, timestamp: this.timestamp() };
    const form = new URLSearchParams({
      ...Object.fromEntries(Object.entries(params).map(([name, value]) => [name, String(value)])),
      api_key: this.config.apiKey,
      signature: signCloudinaryParams(params, this.config.apiSecret),
    });
    const response = await fetch(`${API_BASE}/${this.config.cloudName}/image/destroy`, {
      method: "POST",
      body: form,
    });
    if (!response.ok) throw new Error(`Cloudinary delete failed (${response.status})`);
  }

  getUrl(key: string, transform?: ImageTransform): string {
    return cloudinaryUrl(this.config.cloudName, key, transform);
  }
}
