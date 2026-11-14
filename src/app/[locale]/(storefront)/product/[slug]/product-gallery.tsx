"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { MediaImage } from "@/components/shared/media-image";
import { cn } from "@/lib/utils";
import { useProductSelection } from "./product-selection";

export interface GalleryImage {
  src: string;
  alt: string;
  /** Set when the photo shows one colour of the product. */
  colourId: string | null;
}

/**
 * Product gallery: one large 4:5 frame (never cropped) with thumbnails.
 * Choosing a colour shows that colour's photos first; photos without a colour
 * are shown for every colour. Thumbnails are real buttons.
 */
export function ProductGallery({ images }: { images: readonly GalleryImage[] }) {
  const t = useTranslations("Product");
  const { colourId } = useProductSelection();
  // The chosen photo belongs to a colour; a new colour starts from its first photo.
  const [picked, setPicked] = useState({ colourId, index: 0 });
  const activeIndex = picked.colourId === colourId ? picked.index : 0;
  const setActiveIndex = (index: number) => setPicked({ colourId, index });

  const forColour = colourId === null ? [] : images.filter((image) => image.colourId === colourId);
  const shown =
    forColour.length > 0
      ? [...forColour, ...images.filter((image) => image.colourId === null)]
      : images;

  const active = shown[activeIndex] ?? shown[0];
  if (active === undefined) return null;

  return (
    <div className="flex flex-col gap-4" data-testid="product-gallery">
      <MediaImage
        src={active.src}
        alt={active.alt}
        ratio="product"
        className="rounded-lg"
        sizes="(max-width: 1024px) 100vw, 50vw"
        priority
      />

      {shown.length > 1 ? (
        <ul className="grid grid-cols-4 gap-3 sm:grid-cols-5">
          {shown.map((image, index) => (
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
