import { describe, expect, it, vi } from "vitest";

import {
  detectImageFormat,
  validateImageUpload,
  validateStoredImage,
} from "@/modules/media/image-validation";

vi.mock("server-only", () => ({}));
const { cloudinaryUrl, signCloudinaryParams } =
  await import("@/integrations/storage/cloudinary.storage");

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => [...text].map((character) => character.charCodeAt(0));

const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10, ...ascii("JFIF"));
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d);
const WEBP = bytes(...ascii("RIFF"), 0x24, 0, 0, 0, ...ascii("WEBPVP8 "));
const AVIF = bytes(
  0,
  0,
  0,
  0x1c,
  ...ascii("ftyp"),
  ...ascii("avif"),
  0,
  0,
  0,
  0,
  ...ascii("mif1miaf"),
);
const AVIF_COMPATIBLE = bytes(
  0,
  0,
  0,
  0x1c,
  ...ascii("ftyp"),
  ...ascii("mif1"),
  0,
  0,
  0,
  0,
  ...ascii("avifmiaf"),
);
const GIF = bytes(...ascii("GIF89a"), 1, 0, 1, 0);
const SVG = bytes(...ascii('<svg xmlns="http://www.w3.org/2000/svg"></svg>'));
const PHP = bytes(...ascii("<?php system($_GET['c']); ?>"));
const MP4 = bytes(
  0,
  0,
  0,
  0x18,
  ...ascii("ftyp"),
  ...ascii("mp42"),
  0,
  0,
  0,
  0,
  ...ascii("isommp42"),
);

describe("image signature detection", () => {
  it("recognises the four allowed formats", () => {
    expect(detectImageFormat(JPEG)).toBe("jpeg");
    expect(detectImageFormat(PNG)).toBe("png");
    expect(detectImageFormat(WEBP)).toBe("webp");
    expect(detectImageFormat(AVIF)).toBe("avif");
    expect(detectImageFormat(AVIF_COMPATIBLE)).toBe("avif");
  });

  it("rejects everything else", () => {
    for (const other of [GIF, SVG, PHP, MP4, bytes(), bytes(0xff)]) {
      expect(detectImageFormat(other)).toBeNull();
    }
  });
});

describe("upload validation", () => {
  const MB = 1024 * 1024;

  it("accepts a file whose MIME type and signature agree", () => {
    expect(validateImageUpload({ declaredMime: "image/png", bytes: PNG, maxBytes: MB })).toEqual({
      ok: true,
      format: "png",
    });
    expect(validateImageUpload({ declaredMime: "image/jpeg", bytes: JPEG, maxBytes: MB }).ok).toBe(
      true,
    );
  });

  it("rejects a script disguised as an image", () => {
    expect(validateImageUpload({ declaredMime: "image/jpeg", bytes: PHP, maxBytes: MB })).toEqual({
      ok: false,
      problem: "unsupported_type",
    });
  });

  it("rejects a mismatch between declared type and contents", () => {
    expect(validateImageUpload({ declaredMime: "image/jpeg", bytes: PNG, maxBytes: MB })).toEqual({
      ok: false,
      problem: "signature_mismatch",
    });
  });

  it("rejects unsupported declared types even with a real image", () => {
    expect(validateImageUpload({ declaredMime: "image/gif", bytes: GIF, maxBytes: MB }).ok).toBe(
      false,
    );
    expect(
      validateImageUpload({ declaredMime: "image/svg+xml", bytes: SVG, maxBytes: MB }).ok,
    ).toBe(false);
  });

  it("enforces the size limit and refuses empty files", () => {
    const big = new Uint8Array(MB + 1);
    big.set(PNG);
    expect(validateImageUpload({ declaredMime: "image/png", bytes: big, maxBytes: MB })).toEqual({
      ok: false,
      problem: "too_large",
    });
    expect(
      validateImageUpload({ declaredMime: "image/png", bytes: bytes(), maxBytes: MB }),
    ).toEqual({
      ok: false,
      problem: "empty",
    });
  });

  it("checks what a provider reports after a direct upload", () => {
    expect(validateStoredImage({ providerFormat: "jpg", bytes: 1000, maxBytes: MB })).toEqual({
      ok: true,
      format: "jpeg",
    });
    expect(validateStoredImage({ providerFormat: "gif", bytes: 1000, maxBytes: MB }).ok).toBe(
      false,
    );
    expect(validateStoredImage({ providerFormat: "png", bytes: MB + 1, maxBytes: MB }).ok).toBe(
      false,
    );
  });
});

describe("Cloudinary signing (no network)", () => {
  it("matches the example in Cloudinary's documentation", () => {
    expect(
      signCloudinaryParams(
        {
          eager: "w_400,h_300,c_pad|w_260,h_200,c_crop",
          public_id: "sample_image",
          timestamp: 1315060510,
        },
        "abcd",
      ),
    ).toBe("bfd09f95f331f558cbd1320e67aa8d488770583e");
  });

  it("builds delivery URLs with a width limit", () => {
    expect(cloudinaryUrl("demo", "ueh/products/abc", { width: 800 })).toBe(
      "https://res.cloudinary.com/demo/image/upload/c_limit,w_800,f_auto,q_auto/ueh/products/abc",
    );
    expect(cloudinaryUrl("demo", "ueh/products/abc")).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/ueh/products/abc",
    );
  });
});
