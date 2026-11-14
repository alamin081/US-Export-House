import { useLocale, useTranslations } from "next-intl";

import { MediaImage } from "@/components/shared/media-image";
import { Price } from "@/components/shared/price";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { localize } from "@/lib/content";
import { cn } from "@/lib/utils";
import type { ProductCardData } from "@/modules/catalog/storefront-catalog.service";

export interface ProductCardProps {
  product: ProductCardData;
  /** Eager-load the first row of images above the fold. */
  priority?: boolean;
  className?: string;
}

/**
 * The single product card used by every grid on the site, so a product looks
 * identical on the homepage, a category page and search results. Images sit
 * in a 4:5 frame without cropping. Stock is not shown until Phase 7.
 */
export function ProductCard({ product, priority = false, className }: ProductCardProps) {
  const locale = useLocale() as Locale;
  const t = useTranslations("Product");
  const name = localize(product.name, locale);

  return (
    <article className={cn("group relative flex flex-col", className)} data-testid="product-card">
      <Link href={`/product/${product.slug}`} className="focus-visible:outline-none">
        <div className="relative">
          <MediaImage
            src={product.image?.url ?? "/images/products/formal-shirts-1.svg"}
            alt={product.image === null ? name : localize(product.image.alt, locale)}
            ratio="product"
            className="rounded-lg"
            imageClassName="transition-transform duration-500 group-hover:scale-[1.03]"
            priority={priority}
          />

          <div className="absolute top-3 left-3 flex flex-col items-start gap-1.5">
            {product.isNew ? <Badge variant="solid">{t("tagNew")}</Badge> : null}
            {product.isBestseller ? <Badge variant="accent">{t("tagBestseller")}</Badge> : null}
            {product.comparePricePoisha !== null ? (
              <Badge variant="muted">{t("tagSale")}</Badge>
            ) : null}
          </div>
        </div>

        <div className="mt-3.5 flex flex-col gap-1.5">
          <h3 className="text-sm leading-snug font-medium">
            <span className="group-hover:underline group-hover:underline-offset-4">{name}</span>
          </h3>
          <Price
            pricePoisha={product.pricePoisha}
            comparePricePoisha={product.comparePricePoisha}
            from={product.priceVaries}
            size="sm"
          />
        </div>
      </Link>
    </article>
  );
}
