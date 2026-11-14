"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { formatMoney } from "@/lib/money";
import { changeProductStatusAction } from "@/modules/catalog/catalog.actions";
import type { StatusChangeResult } from "@/modules/catalog/product.service";
import { StatusBadge } from "./product-status-panel";

export interface ProductListItem {
  id: string;
  code: string | null;
  nameEn: string;
  missingBengali: boolean;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  categoryName: string;
  brandName: string | null;
  thumbnail: { url: string; altEn: string | null } | null;
  variantCount: number;
  minPricePoisha: number | null;
  maxPricePoisha: number | null;
}

function priceRange(item: ProductListItem): string {
  if (item.minPricePoisha === null || item.maxPricePoisha === null) return "—";
  const low = formatMoney(item.minPricePoisha, "en");
  return item.minPricePoisha === item.maxPricePoisha
    ? low
    : `${low} – ${formatMoney(item.maxPricePoisha, "en")}`;
}

/** Product table with selection and bulk publish / archive (each one re-checked on the server). */
export function ProductTable({
  items,
  canPublish,
}: {
  items: ProductListItem[];
  canPublish: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const [results, setResults] = useState<StatusChangeResult[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const names = new Map(items.map((item) => [item.id, item.nameEn]));

  const bulk = (status: "PUBLISHED" | "ARCHIVED") =>
    startTransition(async () => {
      const result = await changeProductStatusAction({ productIds: selected, status });
      if (result.status === "error") {
        setMessage(result.message);
        setResults(null);
        return;
      }
      setMessage(result.message);
      setResults(result.data);
      setSelected([]);
      router.refresh();
    });

  const allSelected = items.length > 0 && selected.length === items.length;

  return (
    <div className="mt-6">
      {canPublish ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">{selected.length} selected</span>
          <Button
            size="sm"
            variant="outline"
            disabled={selected.length === 0 || pending}
            onClick={() => bulk("PUBLISHED")}
            data-testid="bulk-publish"
          >
            Publish selected
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={selected.length === 0 || pending}
            onClick={() => bulk("ARCHIVED")}
          >
            Archive selected
          </Button>
        </div>
      ) : null}

      {message === null ? null : (
        <div
          role="status"
          className="mb-3 rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm"
          data-testid="bulk-result"
        >
          <p>{message}</p>
          {results === null ? null : (
            <ul className="mt-1 space-y-0.5 text-xs">
              {results
                .filter((result) => !result.ok)
                .map((result) => (
                  <li key={result.productId} className="text-destructive">
                    {names.get(result.productId) ?? result.productId}: {result.reasons.join("; ")}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-background">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="bg-secondary/60 text-left text-xs text-muted-foreground">
            <tr>
              {canPublish ? (
                <th className="w-10 px-3 py-2">
                  <Checkbox
                    aria-label="Select all"
                    checked={allSelected}
                    onChange={(event) =>
                      setSelected(event.target.checked ? items.map((item) => item.id) : [])
                    }
                  />
                </th>
              ) : null}
              <th className="px-3 py-2 font-medium">Product</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 font-medium">Brand</th>
              <th className="px-3 py-2 font-medium">Variants</th>
              <th className="px-3 py-2 font-medium">Price</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                  No products match.
                </td>
              </tr>
            ) : null}
            {items.map((item) => (
              <tr key={item.id} className="border-t border-border" data-testid="product-row">
                {canPublish ? (
                  <td className="px-3 py-2">
                    <Checkbox
                      aria-label={`Select ${item.nameEn}`}
                      checked={selected.includes(item.id)}
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked
                            ? [...current, item.id]
                            : current.filter((id) => id !== item.id),
                        )
                      }
                    />
                  </td>
                ) : null}
                <td className="px-3 py-2">
                  <Link
                    href={`/admin/products/${item.id}`}
                    className="flex items-center gap-3 hover:underline"
                  >
                    <span className="block aspect-[4/5] w-10 shrink-0 overflow-hidden rounded bg-secondary">
                      {item.thumbnail === null ? null : (
                        // eslint-disable-next-line @next/next/no-img-element -- small admin thumbnail
                        <img src={item.thumbnail.url} alt="" className="size-full object-contain" />
                      )}
                    </span>
                    <span>
                      <span className="font-medium">{item.nameEn}</span>
                      <span className="block font-mono text-xs text-muted-foreground">
                        {item.code ?? "—"}
                      </span>
                    </span>
                  </Link>
                  {item.missingBengali ? (
                    <Badge variant="outline" className="mt-1 border-amber-500 text-amber-800">
                      No Bengali name
                    </Badge>
                  ) : null}
                </td>
                <td className="px-3 py-2">{item.categoryName}</td>
                <td className="px-3 py-2">{item.brandName ?? "—"}</td>
                <td className="px-3 py-2 tabular-nums">{item.variantCount}</td>
                <td className="px-3 py-2 tabular-nums">{priceRange(item)}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={item.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
