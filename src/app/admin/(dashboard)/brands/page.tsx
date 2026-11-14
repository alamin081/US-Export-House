import Link from "next/link";
import { Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { requireStaffPage } from "@/modules/access/access.service";
import { hasPermission } from "@/modules/access/authorization";
import { getBrands } from "@/modules/catalog/taxonomy.service";

export const metadata = { title: "Brands" };

export default async function BrandsPage() {
  const staff = await requireStaffPage("catalog.read");
  const brands = await getBrands(staff);

  return (
    <div className="mx-auto max-w-4xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Brands</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A brand with products can be deactivated but not deleted.
          </p>
        </div>
        {hasPermission(staff, "catalog.write") ? (
          <Link href="/admin/brands/new" className={buttonVariants({ size: "sm" })}>
            <Plus aria-hidden="true" />
            New brand
          </Link>
        ) : null}
      </header>
      <ul className="mt-6 divide-y divide-border rounded-lg border border-border bg-background">
        {brands.map((brand) => (
          <li key={brand.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
            <Link href={`/admin/brands/${brand.id}`} className="font-medium hover:underline">
              {brand.nameEn}
              {brand.nameBn === null ? "" : ` / ${brand.nameBn}`}
            </Link>
            <span className="flex items-center gap-3 text-xs text-muted-foreground">
              {brand._count.products} products
              <Badge variant={brand.isActive ? "success" : "muted"}>
                {brand.isActive ? "active" : "inactive"}
              </Badge>
            </span>
          </li>
        ))}
        {brands.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-muted-foreground">No brands yet.</li>
        ) : null}
      </ul>
    </div>
  );
}
