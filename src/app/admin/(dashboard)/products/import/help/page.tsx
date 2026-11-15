import Link from "next/link";

import { requireStaffPage } from "@/modules/access/access.service";
import { getImportHelp } from "@/modules/catalog/import/product-import.service";

export const metadata = { title: "Import columns" };

function CodeList({
  title,
  items,
}: {
  title: string;
  items: ReadonlyArray<{ code: string; label: string }>;
}) {
  return (
    <section className="rounded-lg border border-border bg-background p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">None yet.</p>
      ) : (
        <ul className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          {items.map((item) => (
            <li key={`${item.code}-${item.label}`}>
              <code className="font-mono text-xs">{item.code}</code>{" "}
              <span className="text-muted-foreground">{item.label}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function ImportHelpPage() {
  const staff = await requireStaffPage("catalog.import");
  const help = await getImportHelp(staff);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header>
        <p className="text-sm text-muted-foreground">
          <Link href="/admin/products/import" className="hover:underline">
            Import
          </Link>{" "}
          / Columns and codes
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Import columns</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One row per variant. Column order is free; unknown columns are ignored. Limits:{" "}
          {Math.round(help.settings.maxBytes / 1024)} KB, {help.settings.maxRows} rows (all or
          nothing up to {help.settings.atomicMaxRows}).
        </p>
      </header>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-secondary/60 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-start font-medium">Column</th>
              <th className="px-3 py-2 text-start font-medium">For</th>
              <th className="px-3 py-2 text-start font-medium">What it holds</th>
              <th className="px-3 py-2 text-start font-medium">Example</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {help.columns
              .filter((column) => column.key !== "cost_tk" || help.canSeeCost)
              .map((column) => (
                <tr key={column.key}>
                  <td className="px-3 py-2 align-top font-mono text-xs">
                    {column.key}
                    {column.requiredForNew ? (
                      <span className="ms-1 text-destructive" title="Required for a new product">
                        *
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 align-top text-muted-foreground">
                    {column.level === "product" ? "Product" : "Variant"}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {column.en}
                    <span className="block text-xs text-muted-foreground" lang="bn">
                      {column.bn}
                    </span>
                    {column.clearable ? (
                      <span className="block text-xs text-muted-foreground">
                        [clear] empties it on an update.
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 align-top font-mono text-xs">{column.example}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">* Required for a new product.</p>

      <div className="grid gap-4 md:grid-cols-2">
        <CodeList
          title="Category codes"
          items={help.categories.map((row) => ({ code: row.code ?? "", label: row.nameEn }))}
        />
        <CodeList
          title="Sizes"
          items={help.sizes.map((row) => ({
            code: row.code,
            label: `${row.valueEn} (${row.group})`,
          }))}
        />
        <CodeList
          title="Colours"
          items={help.colours.map((row) => ({ code: row.code, label: row.valueEn }))}
        />
        <CodeList title="Fits" items={help.fits.map((row) => ({ code: row.key, label: row.en }))} />
        <CodeList
          title="Brands"
          items={help.brands.map((row) => ({ code: row.slug, label: row.nameEn }))}
        />
        <CodeList
          title="Size charts (use the name)"
          items={help.sizeCharts.map((row) => ({ code: "", label: row.nameEn }))}
        />
      </div>
    </div>
  );
}
