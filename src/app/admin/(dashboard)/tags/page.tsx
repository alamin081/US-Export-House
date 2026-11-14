import Link from "next/link";

import { requireStaffPage } from "@/modules/access/access.service";
import { hasAnyPermission } from "@/modules/access/authorization";
import { getTags } from "@/modules/catalog/taxonomy.service";
import { TagEditor } from "./tag-editor";

export const metadata = { title: "Tags" };

export default async function TagsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const staff = await requireStaffPage("catalog.read");
  const [{ edit }, tags] = await Promise.all([searchParams, getTags(staff)]);
  const canWrite = hasAnyPermission(staff, ["catalog.write", "catalog.content"]);
  const editing = tags.find((tag) => tag.id === edit) ?? null;

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight">Tags</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Tags help customers find products. Add other spellings so &quot;panjabi&quot;,
        &quot;punjabi&quot; and &quot;পাঞ্জাবি&quot; all find the same items.
      </p>
      {canWrite ? (
        <div className="mt-6">
          <TagEditor key={editing?.id ?? "new"} initial={editing} />
        </div>
      ) : null}
      <ul className="mt-6 divide-y divide-border rounded-lg border border-border bg-background">
        {tags.map((tag) => (
          <li
            key={tag.id}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
          >
            <Link
              href={canWrite ? `/admin/tags?edit=${tag.id}` : "#"}
              className="font-medium hover:underline"
            >
              {tag.nameEn}
              {tag.nameBn === null ? "" : ` / ${tag.nameBn}`}
            </Link>
            <span className="text-xs text-muted-foreground">
              {tag.aliases.length === 0 ? "no other spellings" : tag.aliases.join(", ")} ·{" "}
              {tag._count.products} products
            </span>
          </li>
        ))}
        {tags.length === 0 ? (
          <li className="px-4 py-6 text-center text-sm text-muted-foreground">No tags yet.</li>
        ) : null}
      </ul>
    </div>
  );
}
