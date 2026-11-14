import Link from "next/link";
import { Plus } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { isMockStorage } from "@/integrations/storage";
import { requireStaffPage } from "@/modules/access/access.service";
import { hasAnyPermission } from "@/modules/access/authorization";
import { listProductsForAdmin } from "@/modules/catalog/product.service";
import { MockStorageBadge } from "../catalogue/fields";
import { loadProductFormReferences } from "./load-references";
import { ProductTable } from "./product-table";

export const metadata = { title: "Products" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const staff = await requireStaffPage("catalog.read");
  const raw = Object.fromEntries(
    Object.entries(await searchParams).map(([key, value]) => [
      key,
      Array.isArray(value) ? value[0] : value,
    ]),
  );
  const [list, references] = await Promise.all([
    listProductsForAdmin(staff, raw),
    loadProductFormReferences(staff),
  ]);
  const { query } = list;
  const pageLink = (page: number) => {
    const params = new URLSearchParams(
      Object.entries({ ...raw, page: String(page) }).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    );
    return `/admin/products?${params.toString()}`;
  };

  return (
    <div className="mx-auto max-w-7xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            One catalogue for every branch, the warehouse and the website.{" "}
            <MockStorageBadge show={isMockStorage()} />
          </p>
        </div>
        {hasAnyPermission(staff, ["catalog.write", "catalog.content"]) ? (
          <Link href="/admin/products/new" className={buttonVariants({ size: "sm" })}>
            <Plus aria-hidden="true" />
            New product
          </Link>
        ) : null}
      </header>

      <form
        method="get"
        className="mt-6 grid gap-3 rounded-lg border border-border bg-background p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]"
      >
        <Input
          name="q"
          defaultValue={query.q ?? ""}
          placeholder="Search name, SKU or barcode"
          aria-label="Search"
        />
        <Select name="categoryId" defaultValue={query.categoryId ?? ""} aria-label="Category">
          <option value="">All categories</option>
          {references.categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.label}
            </option>
          ))}
        </Select>
        <Select name="brandId" defaultValue={query.brandId ?? ""} aria-label="Brand">
          <option value="">All brands</option>
          {references.brands.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.nameEn}
            </option>
          ))}
        </Select>
        <Select name="status" defaultValue={query.status ?? ""} aria-label="Status">
          <option value="">Any status</option>
          <option value="DRAFT">Draft</option>
          <option value="PUBLISHED">Published</option>
          <option value="ARCHIVED">Archived</option>
        </Select>
        <Select name="sort" defaultValue={query.sort} aria-label="Sort">
          <option value="updated">Recently updated</option>
          <option value="created">Recently created</option>
          <option value="name">Name A–Z</option>
          <option value="status">Status</option>
        </Select>
        <button type="submit" className={buttonVariants({ variant: "outline" })}>
          Apply
        </button>
      </form>

      <ProductTable items={list.items} canPublish={staff.permissions.includes("catalog.publish")} />

      <nav aria-label="Pagination" className="mt-4 flex items-center justify-between text-sm">
        <span className="text-muted-foreground tabular-nums">
          {list.total} product{list.total === 1 ? "" : "s"} · page {query.page} of {list.pageCount}
        </span>
        <span className="flex gap-2">
          {query.page > 1 ? (
            <Link
              className={buttonVariants({ variant: "outline", size: "sm" })}
              href={pageLink(query.page - 1)}
            >
              Previous
            </Link>
          ) : null}
          {query.page < list.pageCount ? (
            <Link
              className={buttonVariants({ variant: "outline", size: "sm" })}
              href={pageLink(query.page + 1)}
            >
              Next
            </Link>
          ) : null}
        </span>
      </nav>
    </div>
  );
}
