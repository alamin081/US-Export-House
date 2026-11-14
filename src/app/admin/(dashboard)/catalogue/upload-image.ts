"use client";

import type { UploadTicketResponse, UploadedImage } from "@/modules/media/media.service";

/**
 * Browser side of an image upload:
 *   1. ask the server for a ticket (signed Cloudinary fields, or the mock URL);
 *   2. shrink the image so its longest side is at most the configured edge
 *      (default 2400 px) — this also drops EXIF data such as GPS position;
 *   3. upload: straight to Cloudinary, then let the server verify it; or, with
 *      mock storage, to our own endpoint, which verifies before writing.
 * The server re-checks everything; these steps only save bandwidth and time.
 */

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/avif"];
export const ACCEPT_ATTRIBUTE = ACCEPTED.join(",");

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body.error?.message ?? `Upload failed (${response.status}).`;
  } catch {
    return `Upload failed (${response.status}).`;
  }
}

/** Resizes when larger than `maxEdge`; returns the original file otherwise. */
async function shrink(file: File, maxEdge: number): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // The browser cannot decode it; the server will judge it.
  }
  const longest = Math.max(bitmap.width, bitmap.height);
  if (longest <= maxEdge) {
    bitmap.close();
    return file;
  }

  const scale = maxEdge / longest;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (context === null) return file;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  // Canvas cannot encode AVIF; WebP keeps the quality at a similar size.
  const type = file.type === "image/png" || file.type === "image/jpeg" ? file.type : "image/webp";
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9));
  return blob ?? file;
}

export async function uploadImage(file: File): Promise<UploadedImage> {
  if (!ACCEPTED.includes(file.type)) {
    throw new Error("Only JPEG, PNG, WebP and AVIF images can be uploaded.");
  }

  const ticketResponse = await fetch("/api/admin/uploads/ticket", { method: "POST" });
  if (!ticketResponse.ok) throw new Error(await readError(ticketResponse));
  const { ticket, maxBytes, maxEdgePx } = (await ticketResponse.json()) as UploadTicketResponse;

  const blob = await shrink(file, maxEdgePx);
  if (blob.size > maxBytes) {
    throw new Error(
      `The image is larger than ${Math.round(maxBytes / 1024 / 1024)} MB even after resizing.`,
    );
  }

  const form = new FormData();
  if (ticket.kind === "server") {
    form.set("file", blob, "upload");
    const response = await fetch(ticket.uploadUrl, { method: "POST", body: form });
    if (!response.ok) throw new Error(await readError(response));
    return (await response.json()) as UploadedImage;
  }

  for (const [name, value] of Object.entries(ticket.fields)) form.set(name, value);
  form.set("file", blob, "upload");
  const direct = await fetch(ticket.uploadUrl, { method: "POST", body: form });
  if (!direct.ok) throw new Error("Cloudinary refused the upload.");

  const complete = await fetch("/api/admin/uploads/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key: ticket.key }),
  });
  if (!complete.ok) throw new Error(await readError(complete));
  return (await complete.json()) as UploadedImage;
}
