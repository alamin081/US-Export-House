import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * Image wrapper for all catalogue and editorial imagery.
 *
 * PHASE 3: every image under `public/images/` is a generated SVG placeholder,
 * and the Next.js image optimizer refuses SVG unless the unsafe
 * `dangerouslyAllowSVG` flag is turned on. Rather than enable that flag, SVG
 * sources are served as-is (they are vector and a few kilobytes each).
 *
 * When real photography arrives (JPEG/WebP, uploaded through the admin in
 * Phase 6), it is optimized automatically - nothing here needs to change.
 */
function isVectorPlaceholder(src: string): boolean {
  return src.endsWith(".svg");
}

export interface MediaImageProps {
  src: string;
  alt: string;
  /** Aspect ratio of the frame. Product imagery is always 4:5. */
  ratio?: "product" | "square" | "wide" | "portrait";
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
  className,
  imageClassName,
  sizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw",
  priority = false,
}: MediaImageProps) {
  return (
    <div className={cn("relative overflow-hidden bg-secondary", RATIO_CLASS[ratio], className)}>
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        unoptimized={isVectorPlaceholder(src)}
        className={cn("object-cover", imageClassName)}
      />
    </div>
  );
}
