import Link from "next/link";
import { notFound } from "next/navigation";

import { isAppError } from "@/lib/errors";
import { isMockStorage } from "@/integrations/storage";
import { requireStaffPage } from "@/modules/access/access.service";
import { hasPermission } from "@/modules/access/authorization";
import { getProductForEdit } from "@/modules/catalog/product.service";
import { draftWarnings } from "@/modules/catalog/publish-rules";
import { loadProductFormReferences } from "../load-references";
import { ProductCopyForm } from "../product-copy-form";
import { ProductForm } from "../product-form";
import { ProductStatusPanel } from "../product-status-panel";

export const metadata = { title: "Edit product" };

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const staff = await requireStaffPage("catalog.read");
  const [{ id }, { saved }] = await Promise.all([params, searchParams]);

  let product;
  try {
    product = await getProductForEdit(staff, id);
  } catch (error) {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  }
  const references = await loadProductFormReferences(staff);
  const canWrite = hasPermission(staff, "catalog.write");
  const warnings =
    product.status === "DRAFT"
      ? draftWarnings({
          nameEn: product.nameEn,
          nameBn: product.nameBn,
          imageCount: product.images.length,
          variants: product.variants.map((variant) => ({ ...variant, deleted: false })),
        })
      : [];

  return (
    <div className="mx-auto max-w-7xl">
      <Link href="/admin/products" className="text-xs text-muted-foreground hover:underline">
        ← Products
      </Link>
      <div className="mt-2 flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{product.nameEn}</h1>
        <span className="font-mono text-xs text-muted-foreground">
          {product.code ?? "no product code"}
        </span>
      </div>
      {saved === "1" ? (
        <p role="status" className="mt-2 text-sm text-success">
          Saved.
        </p>
      ) : null}
      {warnings.length === 0 ? null : (
        <ul className="mt-3 flex flex-wrap gap-2" data-testid="draft-warnings">
          {warnings.map((warning) => (
            <li
              key={warning}
              className="rounded-sm border border-amber-500 bg-amber-50 px-2 py-0.5 text-xs text-amber-900"
            >
              {warning}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_16rem]">
        <div className="min-w-0">
          {/* Remounts on every saved version, so the form always starts from the database. */}
          {canWrite ? (
            <ProductForm
              key={product.version}
              initial={product}
              references={references}
              canPrice={hasPermission(staff, "catalog.price.write")}
              mockStorage={isMockStorage()}
            />
          ) : hasPermission(staff, "catalog.content") ? (
            <ProductCopyForm
              key={product.version}
              initial={product}
              categories={references.categories}
            />
          ) : (
            <p className="rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground">
              You can view the catalogue but not edit it.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-4">
          <ProductStatusPanel
            productId={product.id}
            status={product.status}
            canPublish={hasPermission(staff, "catalog.publish")}
            canDelete={hasPermission(staff, "catalog.delete")}
            storefrontPath={`/product/${product.slug}`}
          />
          <div className="rounded-lg border border-border bg-background p-4 text-xs text-muted-foreground">
            <p>Version {product.version}</p>
            <p className="mt-1">
              If someone else saves while you edit, your save is refused instead of overwriting
              their changes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
