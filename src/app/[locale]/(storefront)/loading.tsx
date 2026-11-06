import { ProductGridSkeleton } from "@/components/shared/product-grid";
import { Skeleton } from "@/components/ui/skeleton";

/** Route-level loading state. Mirrors the geometry of a listing page. */
export default function StorefrontLoading() {
  return (
    <div className="site-container py-10 lg:py-14">
      <Skeleton className="h-3 w-40" />
      <Skeleton className="mt-6 h-9 w-72" />
      <Skeleton className="mt-4 h-4 w-full max-w-md" />

      <div className="mt-10 grid gap-10 lg:grid-cols-[16rem_1fr] lg:gap-12">
        <div className="hidden flex-col gap-5 lg:flex">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
        <ProductGridSkeleton count={8} />
      </div>
    </div>
  );
}
