import Link from "next/link";
import { Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { requireStaffPage } from "@/modules/access/access.service";
import { listCouponsForStaff } from "@/modules/checkout-admin/checkout-admin.service";
import { forPage } from "../page-guard";

export const metadata = { title: "Coupons" };

function describe(coupon: { type: string; value: number }) {
  if (coupon.type === "PERCENTAGE") return `${coupon.value}% off`;
  if (coupon.type === "FIXED") return `${formatMoney(coupon.value, "en")} off`;
  return "Free delivery";
}

function dhaka(date: Date | null) {
  return date === null
    ? "—"
    : new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Dhaka",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

/** Coupons with their usage: orders, discount given, remaining uses. */
export default async function CouponsPage() {
  const staff = await requireStaffPage("coupon.manage");
  const coupons = await forPage(listCouponsForStaff(staff));
  const now = new Date();

  return (
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Coupons</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Codes customers type at checkout. A coupon that has been used cannot be deleted; turn it
            off instead.
          </p>
        </div>
        <Link href="/admin/coupons/new" className={buttonVariants({ size: "sm" })}>
          <Plus aria-hidden="true" />
          New coupon
        </Link>
      </header>

      <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-background">
        <table className="w-full min-w-[56rem] text-sm" data-testid="coupons-table">
          <thead className="bg-secondary/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Code</th>
              <th className="px-4 py-2.5 font-medium">Offer</th>
              <th className="px-4 py-2.5 font-medium">Valid</th>
              <th className="px-4 py-2.5 text-right font-medium">Used</th>
              <th className="px-4 py-2.5 text-right font-medium">Orders</th>
              <th className="px-4 py-2.5 text-right font-medium">Discount given</th>
            </tr>
          </thead>
          <tbody>
            {coupons.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  No coupons yet.
                </td>
              </tr>
            ) : (
              coupons.map((coupon) => {
                const expired = coupon.endsAt !== null && coupon.endsAt < now;
                return (
                  <tr key={coupon.id} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">
                      <Link className="hover:underline" href={`/admin/coupons/${coupon.id}`}>
                        {coupon.code}
                      </Link>
                      <span className="ms-2 inline-flex gap-1">
                        {coupon.isActive ? null : <Badge variant="muted">Off</Badge>}
                        {expired ? <Badge variant="muted">Expired</Badge> : null}
                        {coupon.scopes.length > 0 ? (
                          <Badge variant="outline">Limited to items</Badge>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {describe(coupon)}
                      {coupon.minSubtotalPoisha === null ? null : (
                        <span className="block text-xs text-muted-foreground">
                          from {formatMoney(coupon.minSubtotalPoisha, "en")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {dhaka(coupon.startsAt)} → {dhaka(coupon.endsAt)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {coupon.usedCount}
                      {coupon.usageLimit === null ? "" : ` / ${coupon.usageLimit}`}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{coupon.orders}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatMoney(coupon.discountGivenPoisha, "en")}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
