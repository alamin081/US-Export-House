import { useLocale, useTranslations } from "next-intl";

import { MediaImage } from "@/components/shared/media-image";
import { Price } from "@/components/shared/price";
import { RatingStars } from "@/components/shared/rating-stars";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { localize } from "@/lib/content";
import { cn } from "@/lib/utils";
import type { MockProduct } from "@/modules/catalog/catalog.mock";

export interface ProductCardProps {
  product: MockProduct;
  /** Eager-load the first row of images above the fold. */
  priority?: boolean;
  className?: string;
}

/**
 * The single product card used by every grid on the site, so a product looks
 * identical on the homepage, a category page and search results.
 */
export function ProductCard({ product, priority = false, className }: ProductCardProps) {
  const locale = useLocale() as Locale;
  const t = useTranslations("Product");

  const name = localize(product.name, locale);
  const firstImage = product.images[0];
  const isSoldOut = product.availability === "out_of_stock";

  return (
    <article className={cn("group relative flex flex-col", className)}>
      <Link href={`/product/${product.slug}`} className="focus-visible:outline-none">
        <div className="relative">
          <MediaImage
            src={firstImage?.src ?? "/images/products/formal-shirts-1.svg"}
            alt={firstImage === undefined ? name : localize(firstImage.alt, locale)}
            ratio="product"
            className="rounded-lg"
            imageClassName="transition-transform duration-500 group-hover:scale-[1.03]"
            priority={priority}
          />

          <div className="absolute top-3 left-3 flex flex-col items-start gap-1.5">
            {product.tags.includes("new") ? <Badge variant="solid">{t("tagNew")}</Badge> : null}
            {product.tags.includes("bestseller") ? (
              <Badge variant="accent">{t("tagBestseller")}</Badge>
            ) : null}
            {product.tags.includes("sale") ? <Badge variant="muted">{t("tagSale")}</Badge> : null}
          </div>

          {isSoldOut ? (
            <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/70">
              <span className="rounded-sm bg-foreground px-3 py-1.5 text-xs font-medium tracking-wide text-background uppercase">
                {t("soldOut")}
              </span>
            </div>
          ) : null}
        </div>

        <div className="mt-3.5 flex flex-col gap-1.5">
          <h3 className="text-sm leading-snug font-medium">
            <span className="group-hover:underline group-hover:underline-offset-4">{name}</span>
          </h3>
          <Price
            pricePoisha={product.pricePoisha}
            {...(product.comparePricePoisha === undefined
              ? {}
              : { comparePricePoisha: product.comparePricePoisha })}
            size="sm"
          />
          <RatingStars rating={product.rating} reviewCount={product.reviewCount} />
        </div>
      </Link>

      {product.availability === "low_stock" ? (
        <p className="mt-1.5 text-xs text-destructive">{t("lowStock")}</p>
      ) : null}
    </article>
  );
}
