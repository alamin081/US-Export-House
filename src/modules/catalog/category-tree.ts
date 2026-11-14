/**
 * Category tree rules — pure, so they are unit-tested without a database.
 *
 *  - A category cannot become its own parent or a descendant of itself.
 *  - The tree is at most `maxDepth` levels deep (setting, default 3):
 *    Men > Shirts > Formal Shirts.
 */

export interface TreeNode {
  id: string;
  parentId: string | null;
}

export type MoveProblem = "self_parent" | "cycle" | "too_deep" | "unknown_parent";

/** Ancestors of a node, nearest first. Stops on a broken or cyclic chain. */
export function ancestorsOf(id: string, nodes: ReadonlyMap<string, TreeNode>): string[] {
  const ancestors: string[] = [];
  const seen = new Set<string>([id]);
  let current = nodes.get(id)?.parentId ?? null;
  while (current !== null && !seen.has(current)) {
    ancestors.push(current);
    seen.add(current);
    current = nodes.get(current)?.parentId ?? null;
  }
  return ancestors;
}

/** 1 for a root category. */
export function depthOf(id: string | null, nodes: ReadonlyMap<string, TreeNode>): number {
  if (id === null) return 0;
  return ancestorsOf(id, nodes).length + 1;
}

/** Levels below a node, counting the node itself (a leaf has height 1). */
export function subtreeHeight(id: string, nodes: ReadonlyMap<string, TreeNode>): number {
  const children = [...nodes.values()].filter((node) => node.parentId === id);
  if (children.length === 0) return 1;
  return 1 + Math.max(...children.map((child) => subtreeHeight(child.id, nodes)));
}

/**
 * Checks putting `id` (null for a new category) under `newParentId`.
 * Returns the first problem, or null when the move is allowed.
 */
export function checkCategoryMove(
  id: string | null,
  newParentId: string | null,
  nodes: ReadonlyMap<string, TreeNode>,
  maxDepth: number,
): MoveProblem | null {
  if (newParentId !== null && !nodes.has(newParentId)) return "unknown_parent";
  if (id !== null && newParentId === id) return "self_parent";
  if (id !== null && newParentId !== null && ancestorsOf(newParentId, nodes).includes(id)) {
    return "cycle";
  }
  const height = id === null ? 1 : subtreeHeight(id, nodes);
  if (depthOf(newParentId, nodes) + height > maxDepth) return "too_deep";
  return null;
}

export interface TreeItem<T> {
  node: T;
  depth: number;
  children: Array<TreeItem<T>>;
}

/** Nested tree, siblings ordered by `sortOrder` then name. */
export function buildTree<T extends TreeNode & { sortOrder: number; nameEn: string }>(
  rows: readonly T[],
): Array<TreeItem<T>> {
  const byParent = new Map<string | null, T[]>();
  const ids = new Set(rows.map((row) => row.id));
  for (const row of rows) {
    // Orphans (parent deleted) are shown at the root rather than lost.
    const parent = row.parentId !== null && ids.has(row.parentId) ? row.parentId : null;
    byParent.set(parent, [...(byParent.get(parent) ?? []), row]);
  }
  const sort = (list: T[]) =>
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.nameEn.localeCompare(b.nameEn));

  const walk = (parentId: string | null, depth: number): Array<TreeItem<T>> =>
    sort(byParent.get(parentId) ?? []).map((node) => ({
      node,
      depth,
      children: walk(node.id, depth + 1),
    }));

  return walk(null, 1);
}

/** Depth-first flattening for tables and <select> lists. */
export function flattenTree<T>(
  items: ReadonlyArray<TreeItem<T>>,
): Array<{ node: T; depth: number }> {
  return items.flatMap((item) => [
    { node: item.node, depth: item.depth },
    ...flattenTree(item.children),
  ]);
}
