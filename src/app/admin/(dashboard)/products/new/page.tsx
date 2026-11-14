import Link from "next/link";
import { redirect } from "next/navigation";

import { isMockStorage } from "@/integrations/storage";
import { requireStaffPage } from "@/modules/access/access.service";
import { hasPermission } from "@/modules/access/authorization";
import { loadProductFormReferences } from "../load-references";
import { ProductCopyForm } from "../product-copy-form";
import { ProductForm } from "../product-form";

export const metadata = { title: "New product" };

/**
 * Full form for catalogue managers; a copy-only draft form for Content
 * Editors (catalog.content). The services enforce the same split.
 */
export default async function NewProductPage() {
  const staff = await requireStaffPage("catalog.read");
  const canWrite = hasPermission(staff, "catalog.write");
  if (!canWrite && !hasPermission(staff, "catalog.content")) {
    redirect("/admin/forbidden?need=catalog.write");
  }
  const references = await loadProductFormReferences(staff);

  return (
    <div className="mx-auto max-w-7xl">
      <Link href="/admin/products" className="text-xs text-muted-foreground hover:underline">
        ← Products
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">New product</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Saved as a draft. Publish it once it has names in both languages, an image and priced
        variants.
      </p>
      <div className="mt-6">
        {canWrite ? (
          <ProductForm
            initial={null}
            references={references}
            canPrice={hasPermission(staff, "catalog.price.write")}
            mockStorage={isMockStorage()}
          />
        ) : (
          <ProductCopyForm initial={null} categories={references.categories} />
        )}
      </div>
    </div>
  );
}
