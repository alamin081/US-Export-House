import { MediaImage } from "@/components/shared/media-image";
import { ProductCard } from "@/components/shared/product-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { ProductCardData } from "@/modules/catalog/storefront-catalog.service";

/**
 * Responsive product grid: 2 columns on mobile, 3 on tablet, 4 on desktop
 * (agreed in the Phase 3 design decisions).
 */
export function ProductGrid({
  products,
  className,
  priorityCount = 0,
}: {
  products: readonly ProductCardData[];
  className?: string;
  /** How many cards load their image eagerly (above the fold). */
  priorityCount?: number;
}) {
  return (
    <ul
      className={cn(
        "grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4",
        className,
      )}
    >
      {products.map((product, index) => (
        <li key={product.id}>
          <ProductCard product={product} priority={index < priorityCount} />
        </li>
      ))}
    </ul>
  );
}

/** Loading state with the same geometry as the real grid, to avoid layout shift. */
export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div
      className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4"
      aria-hidden="true"
    >
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex flex-col gap-3.5">
          <Skeleton className="aspect-[4/5] w-full rounded-lg" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      ))}
    </div>
  );
}

/** A single horizontal "look" tile used by the collections row. */
export function CollectionTile({
  title,
  description,
  meta,
  href,
  image,
  imageAlt,
}: {
  title: string;
  description: string;
  meta: string;
  href: string;
  image: string;
  imageAlt: string;
}) {
  return (
    <Link href={href} className="group block">
      <MediaImage
        src={image}
        alt={imageAlt}
        ratio="portrait"
        className="rounded-lg"
        imageClassName="transition-transform duration-500 group-hover:scale-[1.03]"
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
      />
      <div className="mt-4">
        <p className="text-xs tracking-[0.18em] text-muted-foreground uppercase">{meta}</p>
        <h3 className="mt-1.5 text-lg font-medium group-hover:underline group-hover:underline-offset-4">
          {title}
        </h3>
        <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
      </div>
    </Link>
  );
}
