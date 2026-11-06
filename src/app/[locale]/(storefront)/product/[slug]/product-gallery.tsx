"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { MediaImage } from "@/components/shared/media-image";
import { cn } from "@/lib/utils";

export interface GalleryImage {
  src: string;
  alt: string;
}

/**
 * Product gallery: one large 4:5 frame with thumbnails underneath. Thumbnails
 * are real buttons, so the gallery is keyboard and screen-reader navigable.
 */
export function ProductGallery({ images }: { images: readonly GalleryImage[] }) {
  const t = useTranslations("Product");
  const [activeIndex, setActiveIndex] = useState(0);
  const active = images[activeIndex] ?? images[0];

  if (active === undefined) return null;

  return (
    <div className="flex flex-col gap-4">
      <MediaImage
        src={active.src}
        alt={active.alt}
        ratio="product"
        className="rounded-lg"
        sizes="(max-width: 1024px) 100vw, 50vw"
        priority
      />

      {images.length > 1 ? (
        <ul className="grid grid-cols-4 gap-3">
          {images.map((image, index) => (
            <li key={image.src + String(index)}>
              <button
                type="button"
                onClick={() => setActiveIndex(index)}
                aria-label={t("galleryThumb", { number: String(index + 1) })}
                aria-current={index === activeIndex ? "true" : undefined}
                className={cn(
                  "block w-full overflow-hidden rounded-md border-2 transition-colors",
                  index === activeIndex
                    ? "border-foreground"
                    : "border-transparent hover:border-border",
                )}
              >
                <MediaImage
                  src={image.src}
                  alt=""
                  ratio="product"
                  sizes="12vw"
                  className="rounded-sm"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
