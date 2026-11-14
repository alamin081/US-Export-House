import Link from "next/link";
import { notFound } from "next/navigation";

import { isAppError } from "@/lib/errors";
import { isMockStorage } from "@/integrations/storage";
import { requireStaffPage } from "@/modules/access/access.service";
import { hasPermission } from "@/modules/access/authorization";
import { getBrand, getBrands } from "@/modules/catalog/taxonomy.service";
import { BrandForm } from "./brand-form";

/** Shared body of /admin/brands/new and /admin/brands/[id]. */
export async function BrandEditorPage({ brandId }: { brandId: string | null }) {
  const staff = await requireStaffPage("catalog.write");
  let initial = null;
  if (brandId !== null) {
    try {
      const brand = await getBrand(staff, brandId);
      const counted = (await getBrands(staff)).find((candidate) => candidate.id === brand.id);
      initial = { ...brand, productCount: counted?._count.products ?? 0 };
    } catch (error) {
      if (isAppError(error) && error.code === "NOT_FOUND") notFound();
      throw error;
    }
  }
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/brands" className="text-xs text-muted-foreground hover:underline">
        ← Brands
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        {initial === null ? "New brand" : initial.nameEn}
      </h1>
      <div className="mt-6">
        <BrandForm
          initial={initial}
          mockStorage={isMockStorage()}
          canDelete={hasPermission(staff, "catalog.delete")}
        />
      </div>
    </div>
  );
}
