import Link from "next/link";
import { notFound } from "next/navigation";

import { isAppError } from "@/lib/errors";
import { isMockStorage } from "@/integrations/storage";
import { requireStaffPage } from "@/modules/access/access.service";
import { ancestorsOf, flattenTree, type TreeNode } from "@/modules/catalog/category-tree";
import { getCategory, getCategoryTree, getSizeCharts } from "@/modules/catalog/taxonomy.service";
import { CategoryForm, type CategoryFormInitial } from "./category-form";

/** Shared body of /admin/categories/new and /admin/categories/[id]. */
export async function CategoryEditorPage({ categoryId }: { categoryId: string | null }) {
  const staff = await requireStaffPage("catalog.write");
  let initial: CategoryFormInitial | null = null;
  if (categoryId !== null) {
    try {
      initial = await getCategory(staff, categoryId);
    } catch (error) {
      if (isAppError(error) && error.code === "NOT_FOUND") notFound();
      throw error;
    }
  }
  const [{ tree, rows }, sizeCharts] = await Promise.all([
    getCategoryTree(staff),
    getSizeCharts(staff),
  ]);
  const nodes = new Map<string, TreeNode>(rows.map((row) => [row.id, row]));
  const names = new Map(rows.map((row) => [row.id, row.nameEn]));
  // Neither the category itself nor its descendants can become its parent.
  const parents = flattenTree(tree)
    .filter(
      ({ node }) =>
        categoryId === null ||
        (node.id !== categoryId && !ancestorsOf(node.id, nodes).includes(categoryId)),
    )
    .map(({ node }) => ({
      id: node.id,
      label: [...ancestorsOf(node.id, nodes)]
        .reverse()
        .concat(node.id)
        .map((id) => names.get(id))
        .join(" › "),
    }));

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/admin/categories" className="text-xs text-muted-foreground hover:underline">
        ← Categories
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        {initial === null ? "New category" : initial.nameEn}
      </h1>
      <div className="mt-6">
        <CategoryForm
          initial={initial}
          parents={parents}
          sizeCharts={sizeCharts.map((chart) => ({ id: chart.id, nameEn: chart.nameEn }))}
          mockStorage={isMockStorage()}
        />
      </div>
    </div>
  );
}
