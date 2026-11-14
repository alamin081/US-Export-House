import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { requireStaffPage } from "@/modules/access/access.service";
import { hasPermission } from "@/modules/access/authorization";
import { getOptionPresets } from "@/modules/catalog/taxonomy.service";
import { PresetEditor } from "./preset-editor";

export const metadata = { title: "Options" };

/**
 * The option library: sizes and colours the variant matrix offers. Products
 * copy the values they use, so editing a preset never rewrites existing SKUs.
 */
export default async function OptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const staff = await requireStaffPage("catalog.read");
  const [{ edit }, presets] = await Promise.all([searchParams, getOptionPresets(staff)]);
  const canWrite = hasPermission(staff, "catalog.write");
  const editing = presets.find((preset) => preset.id === edit) ?? null;

  const groups = new Map<string, typeof presets>();
  for (const preset of presets) {
    const key = `${preset.type === "SIZE" ? "Size" : "Colour"} · ${preset.group}`;
    groups.set(key, [...(groups.get(key) ?? []), preset]);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight">Options</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Sizes and colours offered by the variant generator, in both languages, with the code used in
        SKUs.
      </p>

      {canWrite ? (
        <div className="mt-6">
          <PresetEditor key={editing?.id ?? "new"} initial={editing} />
        </div>
      ) : null}

      <div className="mt-6 flex flex-col gap-6">
        {[...groups.entries()].map(([label, list]) => (
          <section key={label}>
            <h2 className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
              {label}
            </h2>
            <ul className="mt-2 flex flex-wrap gap-2">
              {list.map((preset) => (
                <li key={preset.id}>
                  <Link
                    href={canWrite ? `/admin/options?edit=${preset.id}` : "#"}
                    className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm hover:bg-secondary"
                  >
                    {preset.hex === null ? null : (
                      <span
                        aria-hidden="true"
                        className="size-3.5 rounded-full ring-1 ring-border"
                        style={{ backgroundColor: preset.hex }}
                      />
                    )}
                    {preset.valueEn}
                    {preset.valueBn === null ? "" : ` / ${preset.valueBn}`}
                    <span className="font-mono text-xs text-muted-foreground">{preset.code}</span>
                    {preset.isActive ? null : <Badge variant="muted">off</Badge>}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {presets.length === 0 ? (
          <p className="text-sm text-muted-foreground">No options yet.</p>
        ) : null}
      </div>
    </div>
  );
}
