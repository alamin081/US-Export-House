"use client";

import Image, { type ImageLoaderProps } from "next/image";

import { cn } from "@/lib/utils";

/**
 * Image wrapper for all catalogue and editorial imagery.
 *
 * - Product imagery is always shown in a 4:5 frame, never cropped: the photo
 *   is contained and the frame's background fills any spare space, so a
 *   square or landscape upload still looks tidy next to portrait ones.
 * - Cloudinary URLs are resized by Cloudinary itself (`c_limit,w_…,f_auto`),
 *   so the Next.js optimizer does not fetch and re-encode them a second time.
 * - SVG placeholders (Phase 3 samples) are served as-is rather than enabling
 *   the unsafe `dangerouslyAllowSVG` optimizer flag.
 */
function isVectorPlaceholder(src: string): boolean {
  return src.endsWith(".svg");
}

const CLOUDINARY_UPLOAD = /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\//;

function cloudinaryLoader({ src, width }: ImageLoaderProps): string {
  // Stored URLs already carry `f_auto,q_auto/`; insert a width limit before it.
  return src.replace(CLOUDINARY_UPLOAD, (prefix) => `${prefix}c_limit,w_${width}/`);
}

export interface MediaImageProps {
  src: string;
  alt: string;
  /** Aspect ratio of the frame. Product imagery is always 4:5. */
  ratio?: "product" | "square" | "wide" | "portrait";
  /** "contain" (default for products) never crops; "cover" fills the frame. */
  fit?: "contain" | "cover";
  className?: string;
  imageClassName?: string;
  sizes?: string;
  priority?: boolean;
}

const RATIO_CLASS: Record<NonNullable<MediaImageProps["ratio"]>, string> = {
  product: "aspect-[4/5]",
  square: "aspect-square",
  wide: "aspect-[8/5]",
  portrait: "aspect-[3/4]",
};

export function MediaImage({
  src,
  alt,
  ratio = "product",
  fit,
  className,
  imageClassName,
  sizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw",
  priority = false,
}: MediaImageProps) {
  const objectFit =
    (fit ?? (ratio === "product" ? "contain" : "cover")) === "contain"
      ? "object-contain"
      : "object-cover";
  const isCloudinary = CLOUDINARY_UPLOAD.test(src);

  return (
    <div className={cn("relative overflow-hidden bg-secondary", RATIO_CLASS[ratio], className)}>
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        preload={priority}
        unoptimized={isVectorPlaceholder(src)}
        {...(isCloudinary ? { loader: cloudinaryLoader } : {})}
        className={cn(objectFit, imageClassName)}
      />
    </div>
  );
}
