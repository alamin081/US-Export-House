import Link from "next/link";

import { requireStaffPage } from "@/modules/access/access.service";
import { hasPermission } from "@/modules/access/authorization";
import { ORDER_TABS } from "@/modules/orders/order-state";
import { listOrdersForStaff } from "@/modules/orders/orders.service";
import { getOrderSettings } from "@/modules/settings/settings.service";
import { COURIER_LABELS } from "@/modules/settings/order-settings";
import { cn } from "@/lib/utils";
import { forPage } from "../page-guard";
import { OrdersTable } from "./orders-table";

export const metadata = { title: "Orders" };

/**
 * Online orders by stage. "New" is the confirmation queue: oldest first,
 * orders flagged for review on top. Phones are masked without customer.read,
 * and staff see only the locations they may access.
 */
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const staff = await requireStaffPage("order.read");
  const query = await searchParams;
  const [result, settings] = await Promise.all([
    forPage(listOrdersForStaff(staff, query)),
    getOrderSettings(),
  ]);
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));
  const link = (changes: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...query, ...changes })) {
      if (value !== undefined && value !== "") params.set(key, value);
    }
    const text = params.toString();
    return text === "" ? "/admin/orders" : `/admin/orders?${text}`;
  };
  const input =
    "h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground placeholder:text-muted-foreground";

  return (
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Confirm by phone, pack, ship and record delivery. Orders marked “Review” should be
            checked carefully before confirming.
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          {hasPermission(staff, "order.cod.reconcile") ? (
            <Link className="underline" href="/admin/orders/cod">
              Courier cash
            </Link>
          ) : null}
          <Link className="underline" href="/admin/customers">
            Customers
          </Link>
        </div>
      </div>

      <nav className="mt-6 flex flex-wrap gap-1 border-b border-border" aria-label="Order stages">
        {ORDER_TABS.map((tab) => (
          <Link
            key={tab.key}
            href={link({ tab: tab.key, page: undefined })}
            aria-current={result.tab === tab.key ? "page" : undefined}
            data-testid={`tab-${tab.key}`}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm",
              result.tab === tab.key
                ? "border-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            {tab.key === "all" ? null : (
              <span className="ms-1.5 text-xs text-muted-foreground tabular-nums">
                {result.tabCounts[tab.key] ?? 0}
              </span>
            )}
          </Link>
        ))}
      </nav>

      <form className="mt-4 flex flex-wrap items-end gap-3" action="/admin/orders">
        <input type="hidden" name="tab" value={result.tab} />
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Search
          <input
            name="q"
            defaultValue={query.q ?? ""}
            placeholder="Order number, phone or name"
            className={cn(input, "w-60")}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          From
          <input type="date" name="from" defaultValue={query.from ?? ""} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          To
          <input type="date" name="to" defaultValue={query.to ?? ""} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Zone code
          <input name="zone" defaultValue={query.zone ?? ""} className={cn(input, "w-32")} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Coupon
          <input name="coupon" defaultValue={query.coupon ?? ""} className={cn(input, "w-28")} />
        </label>
        {result.locations.length > 1 ? (
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Location
            <select name="location" defaultValue={query.location ?? ""} className={input}>
              <option value="">Any</option>
              {result.locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.code}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="review" value="1" defaultChecked={query.review === "1"} />
          Review only
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input
            type="checkbox"
            name="unreachable"
            value="1"
            defaultChecked={query.unreachable === "1"}
          />
          Unreachable only
        </label>
        <button
          type="submit"
          className="h-9 rounded-md border border-input px-4 text-sm hover:bg-secondary"
        >
          Filter
        </button>
      </form>

      <OrdersTable
        rows={result.rows.map((row) => ({
          id: row.id,
          orderNumber: row.orderNumber,
          status: row.status,
          paymentStatus: row.paymentStatus,
          paymentMethod: row.paymentMethod,
          customerName: row.customerName,
          customerPhone: row.customerPhone,
          totalPoisha: row.totalPoisha,
          zoneName: row.zoneName,
          district: row.shipDistrictName,
          couponCode: row.couponCode,
          review: row.reviewReasons.length > 0,
          unreachable: row.unreachableAt !== null,
          packed: row.packedAt !== null,
          placedAt: row.placedAt.toISOString(),
          locationCode: row.location.code,
          lines: row._count.items,
          calls: row._count.callLogs,
        }))}
        canShip={hasPermission(staff, "order.fulfil")}
        canPrint={hasPermission(staff, "invoice.print")}
        couriers={settings.couriers.map((key) => ({ key, label: COURIER_LABELS[key] }))}
      />

      <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pages">
        <span className="text-muted-foreground">
          {result.total} order{result.total === 1 ? "" : "s"} · page {result.page} of {pages}
        </span>
        <span className="flex gap-3">
          {result.page > 1 ? (
            <Link className="underline" href={link({ page: String(result.page - 1) })}>
              Previous
            </Link>
          ) : null}
          {result.page < pages ? (
            <Link className="underline" href={link({ page: String(result.page + 1) })}>
              Next
            </Link>
          ) : null}
        </span>
      </nav>
    </div>
  );
}
