import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatDateTime } from "@/lib/datetime";
import { formatMoney } from "@/lib/money";
import { requireStaffPage } from "@/modules/access/access.service";
import { hasPermission } from "@/modules/access/authorization";
import { SampleBadge } from "@/modules/inventory/components/sample-badge";
import { getVariantStock } from "@/modules/inventory/inventory.service";
import { forPage } from "../../page-guard";
import { AdjustForm, ThresholdInput } from "./stock-forms";

export const metadata = { title: "Item stock" };

const MOVEMENT_TYPES = [
  "OPENING",
  "PURCHASE_RECEIVE",
  "ADJUSTMENT_IN",
  "ADJUSTMENT_OUT",
  "DAMAGE",
  "TRANSFER_OUT",
  "TRANSFER_IN",
  "TRANSFER_DISCREPANCY",
  "COUNT_CORRECTION",
  "RESERVE",
  "RELEASE",
  "SALE_ONLINE",
  "SALE_STORE",
  "RETURN",
] as const;

const REFERENCE_LINKS: Record<string, string> = {
  TRANSFER: "/admin/transfers/",
  STOCK_COUNT: "/admin/stock-counts/",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** One item: stock per location, adjustments, thresholds and the full ledger. */
export default async function VariantStockPage({
  params,
  searchParams,
}: {
  params: Promise<{ variantId: string }>;
  searchParams: SearchParams;
}) {
  const staff = await requireStaffPage("inventory.read");
  const { variantId } = await params;
  const raw = Object.fromEntries(
    Object.entries(await searchParams).map(([key, value]) => [
      key,
      Array.isArray(value) ? value[0] : value,
    ]),
  );
  const data = await forPage(getVariantStock(staff, variantId, raw));
  const canAdjust = hasPermission(staff, "inventory.adjust");
  const pageLink = (page: number) =>
    `/admin/inventory/${variantId}?${new URLSearchParams(
      Object.entries({ ...raw, page: String(page) }).filter(
        (entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== "",
      ),
    ).toString()}`;

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/admin/inventory" className="text-sm text-muted-foreground hover:underline">
        ← Inventory
      </Link>
      <header className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight tabular-nums">{data.variant.sku}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.variant.name}
            {data.variant.label === null ? "" : ` — ${data.variant.label}`}
            {data.variant.barcode === null ? "" : ` · barcode ${data.variant.barcode}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {data.showCost ? (
            <span>
              Average cost:{" "}
              <strong className="tabular-nums">
                {data.variant.costPoisha === null || data.variant.costPoisha === undefined
                  ? "—"
                  : formatMoney(data.variant.costPoisha, "en")}
              </strong>
            </span>
          ) : null}
          <span>
            In transit: <strong className="tabular-nums">{data.inTransit}</strong>
          </span>
        </div>
      </header>

      <section className="mt-6 overflow-x-auto rounded-lg border border-border bg-background">
        <table className="w-full min-w-[40rem] text-sm" data-testid="variant-levels">
          <thead className="bg-secondary/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Location</th>
              <th className="px-4 py-2.5 text-right font-medium">Available</th>
              <th className="px-4 py-2.5 text-right font-medium">On hand</th>
              <th className="px-4 py-2.5 text-right font-medium">Reserved</th>
              <th className="px-4 py-2.5 text-right font-medium">Low-stock threshold</th>
            </tr>
          </thead>
          <tbody>
            {data.locations.map((location) => (
              <tr
                key={location.id}
                className="border-t border-border"
                data-location={location.code}
              >
                <td className="px-4 py-3">
                  <span className="flex flex-wrap items-center gap-2 font-medium">
                    {location.code}
                    <SampleBadge show={location.isSample} />
                    {location.state === "out" && location.hasRow ? (
                      <Badge variant="destructive">Out</Badge>
                    ) : null}
                    {location.state === "low" ? <Badge variant="accent">Low</Badge> : null}
                  </span>
                  <span className="text-xs text-muted-foreground">{location.nameEn}</span>
                </td>
                <td
                  className="px-4 py-3 text-right text-base font-semibold tabular-nums"
                  data-testid="level-available"
                >
                  {location.available}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{location.onHand}</td>
                <td className="px-4 py-3 text-right tabular-nums">{location.reserved}</td>
                <td className="px-4 py-3 text-right">
                  {canAdjust ? (
                    <ThresholdInput
                      variantId={variantId}
                      locationId={location.id}
                      value={location.lowStockThreshold}
                      globalDefault={data.lowStockDefault}
                    />
                  ) : (
                    <span className="tabular-nums">{location.threshold}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {canAdjust && data.locations.length > 0 ? (
        <section className="mt-6 rounded-lg border border-border bg-background p-5">
          <h2 className="mb-4 text-sm font-semibold">Adjust stock</h2>
          <AdjustForm
            variantId={variantId}
            confirmAbove={data.adjustConfirmAbove}
            locations={data.locations.map((location) => ({
              id: location.id,
              code: location.code,
              available: location.available,
            }))}
          />
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="text-sm font-semibold">Movement history</h2>
        <form
          method="get"
          className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto]"
        >
          <Select
            name="locationId"
            defaultValue={data.query.locationId ?? ""}
            aria-label="Location"
          >
            <option value="">All my locations</option>
            {data.locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.code}
              </option>
            ))}
          </Select>
          <Select name="type" defaultValue={data.query.type ?? ""} aria-label="Type">
            <option value="">Any type</option>
            {MOVEMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type.replaceAll("_", " ").toLowerCase()}
              </option>
            ))}
          </Select>
          <Input type="date" name="from" defaultValue={data.query.from ?? ""} aria-label="From" />
          <Input type="date" name="to" defaultValue={data.query.to ?? ""} aria-label="To" />
          <button type="submit" className={buttonVariants({ variant: "outline" })}>
            Filter
          </button>
        </form>

        <div className="mt-3 overflow-x-auto rounded-lg border border-border bg-background">
          <table className="w-full min-w-[48rem] text-sm" data-testid="movement-history">
            <thead className="bg-secondary/60 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Location</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 text-right font-medium">Qty</th>
                <th className="px-3 py-2 text-right font-medium">On hand after</th>
                <th className="px-3 py-2 font-medium">Reason / reference</th>
                <th className="px-3 py-2 font-medium">By</th>
                {data.showCost ? (
                  <th className="px-3 py-2 text-right font-medium">Unit cost</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {data.movements.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                    No movements.
                  </td>
                </tr>
              ) : (
                data.movements.map((movement) => {
                  const link =
                    movement.referenceType !== null && movement.referenceId !== null
                      ? REFERENCE_LINKS[movement.referenceType]
                      : undefined;
                  return (
                    <tr key={movement.id} className="border-t border-border">
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {formatDateTime(movement.createdAt, "en")}
                      </td>
                      <td className="px-3 py-2">{movement.location.code}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline">{movement.type.replaceAll("_", " ")}</Badge>
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-medium tabular-nums ${movement.quantity < 0 ? "text-destructive" : "text-success"}`}
                      >
                        {movement.quantity > 0 ? `+${movement.quantity}` : movement.quantity}
                        {movement.type === "RESERVE" || movement.type === "RELEASE" ? (
                          <span className="block text-[0.6875rem] font-normal text-muted-foreground">
                            reserved
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {movement.onHandAfter ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {[movement.reasonCode, movement.reason].filter(Boolean).join(" · ") || "—"}
                        {link === undefined ? null : (
                          <Link className="ms-2 underline" href={`${link}${movement.referenceId}`}>
                            open
                          </Link>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {movement.user?.name ?? movement.user?.email ?? "system"}
                      </td>
                      {data.showCost ? (
                        <td className="px-3 py-2 text-right tabular-nums">
                          {movement.unitCostPoisha === null
                            ? ""
                            : formatMoney(movement.unitCostPoisha, "en")}
                        </td>
                      ) : null}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <nav aria-label="Pagination" className="mt-3 flex items-center justify-between text-sm">
          <span className="text-muted-foreground tabular-nums">
            {data.movementTotal} movements · page {data.page} of {data.pageCount}
          </span>
          <span className="flex gap-2">
            {data.page > 1 ? (
              <Link
                className={buttonVariants({ variant: "outline", size: "sm" })}
                href={pageLink(data.page - 1)}
              >
                Newer
              </Link>
            ) : null}
            {data.page < data.pageCount ? (
              <Link
                className={buttonVariants({ variant: "outline", size: "sm" })}
                href={pageLink(data.page + 1)}
              >
                Older
              </Link>
            ) : null}
          </span>
        </nav>
      </section>
    </div>
  );
}
