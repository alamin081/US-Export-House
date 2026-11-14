import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import type { getLowStock } from "@/modules/inventory/inventory.service";

/**
 * "Needs restocking": the lowest stock rows at the staff member's own
 * locations (real data since Phase 7), at or below each row's threshold.
 */
export function LowStockWidget({ data }: { data: Awaited<ReturnType<typeof getLowStock>> }) {
  return (
    <section
      className="rounded-lg border border-border bg-background p-5"
      data-testid="low-stock-widget"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Needs restocking</h2>
        <Link
          href="/admin/inventory?stock=low"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {data.total} in total
        </Link>
      </div>
      {data.rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Nothing is at or below its low-stock level.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {data.rows.map((row) => (
            <li
              key={`${row.variantId}:${row.locationCode}`}
              className="flex items-start justify-between gap-3 text-sm"
            >
              <Link href={`/admin/inventory/${row.variantId}`} className="min-w-0 hover:underline">
                <span className="block truncate">{row.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {row.sku} · {row.locationCode}
                </span>
              </Link>
              <Badge variant={row.available === 0 ? "destructive" : "muted"}>
                {row.available === 0 ? "Out" : `${row.available} left`}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
