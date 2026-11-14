/**
 * Upload checks for product images — pure, so they are unit-tested on bytes.
 *
 * Both the declared MIME type and the file's own signature (magic bytes) must
 * say the same allowed format. A PHP script renamed to shirt.jpg fails the
 * signature check; a real PNG sent as image/jpeg fails the agreement check.
 * The file name the browser sent is never used for anything.
 */

export const ALLOWED_IMAGE_FORMATS = ["jpeg", "png", "webp", "avif"] as const;
export type ImageFormat = (typeof ALLOWED_IMAGE_FORMATS)[number];

export const MIME_BY_FORMAT: Record<ImageFormat, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
};

export const EXTENSION_BY_FORMAT: Record<ImageFormat, string> = {
  jpeg: "jpg",
  png: "png",
  webp: "webp",
  avif: "avif",
};

const FORMAT_BY_MIME = new Map<string, ImageFormat>([
  ["image/jpeg", "jpeg"],
  ["image/jpg", "jpeg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
]);

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

/** The image format the bytes actually contain, or null. */
export function detectImageFormat(bytes: Uint8Array): ImageFormat | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)
  ) {
    return "png";
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return "webp";
  }
  if (bytes.length >= 12 && ascii(bytes, 4, 4) === "ftyp") {
    // ISO-BMFF: major brand at 8..12, compatible brands after the version.
    const boxSize = Math.min(
      bytes.length,
      ((bytes[0] ?? 0) << 24) | ((bytes[1] ?? 0) << 16) | ((bytes[2] ?? 0) << 8) | (bytes[3] ?? 0),
    );
    const brands = [ascii(bytes, 8, 4)];
    for (let offset = 16; offset + 4 <= boxSize; offset += 4) brands.push(ascii(bytes, offset, 4));
    if (brands.some((brand) => brand === "avif" || brand === "avis")) return "avif";
  }
  return null;
}

export function formatFromMime(mime: string): ImageFormat | null {
  return FORMAT_BY_MIME.get(mime.toLowerCase().split(";")[0]?.trim() ?? "") ?? null;
}

/** Cloudinary reports "jpg"; normalise it to our names. */
export function formatFromProviderName(name: string): ImageFormat | null {
  const lower = name.toLowerCase();
  if (lower === "jpg" || lower === "jpeg") return "jpeg";
  return (ALLOWED_IMAGE_FORMATS as readonly string[]).includes(lower)
    ? (lower as ImageFormat)
    : null;
}

export type ImageProblem = "empty" | "too_large" | "unsupported_type" | "signature_mismatch";

export const IMAGE_PROBLEM_MESSAGES: Record<ImageProblem, string> = {
  empty: "The file is empty.",
  too_large: "The image is larger than the upload limit.",
  unsupported_type: "Only JPEG, PNG, WebP and AVIF images can be uploaded.",
  signature_mismatch: "The file's contents do not match its image type.",
};

export function validateImageUpload(input: {
  declaredMime: string;
  bytes: Uint8Array;
  maxBytes: number;
}): { ok: true; format: ImageFormat } | { ok: false; problem: ImageProblem } {
  if (input.bytes.length === 0) return { ok: false, problem: "empty" };
  if (input.bytes.length > input.maxBytes) return { ok: false, problem: "too_large" };

  const declared = formatFromMime(input.declaredMime);
  if (declared === null) return { ok: false, problem: "unsupported_type" };

  const actual = detectImageFormat(input.bytes);
  if (actual === null) return { ok: false, problem: "unsupported_type" };
  if (actual !== declared) return { ok: false, problem: "signature_mismatch" };

  return { ok: true, format: actual };
}

/** What the provider says it stored, checked after a direct upload. */
export function validateStoredImage(input: {
  providerFormat: string;
  bytes: number;
  maxBytes: number;
}): { ok: true; format: ImageFormat } | { ok: false; problem: ImageProblem } {
  const format = formatFromProviderName(input.providerFormat);
  if (format === null) return { ok: false, problem: "unsupported_type" };
  if (input.bytes <= 0) return { ok: false, problem: "empty" };
  if (input.bytes > input.maxBytes) return { ok: false, problem: "too_large" };
  return { ok: true, format };
}
