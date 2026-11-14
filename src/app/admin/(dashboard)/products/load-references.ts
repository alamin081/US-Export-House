import "server-only";

import type { StaffContext } from "@/modules/access/authorization";
import { buildTree, flattenTree } from "@/modules/catalog/category-tree";
import { getProductFormReferences } from "@/modules/catalog/product.service";
import type { ProductFormReferences } from "./product-form";

/** Lookup lists for the product form, with categories shown as "Men › Shirts". */
export async function loadProductFormReferences(
  staff: StaffContext,
): Promise<ProductFormReferences> {
  const references = await getProductFormReferences(staff);
  const byId = new Map(references.categories.map((category) => [category.id, category]));
  const pathOf = (id: string): string => {
    const names: string[] = [];
    let current = byId.get(id);
    while (current !== undefined && names.length < 6) {
      names.unshift(current.nameEn);
      current = current.parentId === null ? undefined : byId.get(current.parentId);
    }
    return names.join(" › ");
  };

  return {
    categories: flattenTree(buildTree(references.categories)).map(({ node }) => ({
      id: node.id,
      label: pathOf(node.id),
      code: node.code,
      isActive: node.isActive,
    })),
    brands: references.brands,
    sizeCharts: references.sizeCharts,
    tags: references.tags,
    presets: references.presets.map((preset) => ({
      id: preset.id,
      type: preset.type,
      group: preset.group,
      code: preset.code,
      valueEn: preset.valueEn,
      valueBn: preset.valueBn,
      hex: preset.hex,
    })),
    fits: references.fits,
    skuPattern: references.skuPattern,
  };
}
