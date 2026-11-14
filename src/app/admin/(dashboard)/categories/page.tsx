import Link from "next/link";
import { Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { requireStaffPage } from "@/modules/access/access.service";
import { hasPermission } from "@/modules/access/authorization";
import { flattenTree } from "@/modules/catalog/category-tree";
import { getCategoryTree } from "@/modules/catalog/taxonomy.service";
import { CategoryRowActions } from "./category-row-actions";

export const metadata = { title: "Categories" };

/** Category tree with move up/down (no dragging), edit and delete. */
export default async function CategoriesPage() {
  const staff = await requireStaffPage("catalog.read");
  const { tree, maxDepth } = await getCategoryTree(staff);
  const rows = flattenTree(tree);
  const canWrite = hasPermission(staff, "catalog.write");
  const canDelete = hasPermission(staff, "catalog.delete");

  return (
    <div className="mx-auto max-w-5xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Up to {maxDepth} levels, e.g. Men › Shirts › Formal shirts. A category with products can
            be deactivated but not deleted.
          </p>
        </div>
        {canWrite ? (
          <Link href="/admin/categories/new" className={buttonVariants({ size: "sm" })}>
            <Plus aria-hidden="true" />
            New category
          </Link>
        ) : null}
      </header>

      <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-background">
        <table className="w-full min-w-[44rem] text-sm" data-testid="category-tree">
          <thead className="bg-secondary/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Code</th>
              <th className="px-3 py-2 font-medium">Slug</th>
              <th className="px-3 py-2 font-medium">Products</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ node, depth }, index) => {
              const siblings = rows.filter((row) => row.node.parentId === node.parentId);
              const position = siblings.findIndex((row) => row.node.id === node.id);
              return (
                <tr key={node.id} className="border-t border-border" data-testid="category-row">
                  <td className="px-3 py-2">
                    <span
                      style={{ paddingLeft: `${(depth - 1) * 1.25}rem` }}
                      className="inline-flex items-center gap-1.5"
                    >
                      {depth > 1 ? (
                        <span aria-hidden="true" className="text-muted-foreground">
                          └
                        </span>
                      ) : null}
                      <Link
                        href={`/admin/categories/${node.id}`}
                        className="font-medium hover:underline"
                      >
                        {node.nameEn}
                      </Link>
                      {node.nameBn === null ? (
                        <Badge variant="outline" className="border-amber-500 text-amber-800">
                          no Bengali
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">/ {node.nameBn}</span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{node.code ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{node.slug}</td>
                  <td className="px-3 py-2 tabular-nums">{node._count.products}</td>
                  <td className="px-3 py-2">
                    <Badge variant={node.isActive ? "success" : "muted"}>
                      {node.isActive ? "active" : "inactive"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <CategoryRowActions
                      categoryId={node.id}
                      name={node.nameEn}
                      canMoveUp={canWrite && position > 0}
                      canMoveDown={canWrite && position < siblings.length - 1}
                      canDelete={canDelete && node._count.products === 0}
                      rowIndex={index}
                    />
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  No categories yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
