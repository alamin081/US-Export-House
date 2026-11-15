import Link from "next/link";

import { formatTakaInput } from "@/lib/money";
import { requireStaffPage } from "@/modules/access/access.service";
import {
  getCouponForStaff,
  listCouponCategoryChoices,
} from "@/modules/checkout-admin/checkout-admin.service";
import { forPage } from "../../page-guard";
import { CouponForm, type CouponFormValue } from "../coupon-form";

export const metadata = { title: "Coupon" };

/** A `datetime-local` value in Bangladesh time (UTC+6). */
function dhakaLocal(date: Date | null): string {
  return date === null
    ? ""
    : new Date(date.getTime() + 6 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

const taka = (poisha: number | null) => (poisha === null ? "" : formatTakaInput(poisha));

export default async function CouponPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staff = await requireStaffPage("coupon.manage");
  const [coupon, categories] = await Promise.all([
    forPage(getCouponForStaff(staff, id)),
    forPage(listCouponCategoryChoices(staff)),
  ]);

  const initial: CouponFormValue = {
    code: coupon.code,
    type: coupon.type,
    value: coupon.type === "FIXED" ? taka(coupon.value) : String(coupon.value),
    labelEn: coupon.labelEn ?? "",
    labelBn: coupon.labelBn ?? "",
    minSubtotal: taka(coupon.minSubtotalPoisha),
    maxDiscount: taka(coupon.maxDiscountPoisha),
    startsAt: dhakaLocal(coupon.startsAt),
    endsAt: dhakaLocal(coupon.endsAt),
    usageLimit: coupon.usageLimit === null ? "" : String(coupon.usageLimit),
    usageLimitPerCustomer:
      coupon.usageLimitPerCustomer === null ? "" : String(coupon.usageLimitPerCustomer),
    isActive: coupon.isActive,
    includeCategoryIds: coupon.scopes
      .filter((scope) => scope.mode === "INCLUDE" && scope.categoryId !== null)
      .map((scope) => scope.categoryId!),
    excludeCategoryIds: coupon.scopes
      .filter((scope) => scope.mode === "EXCLUDE" && scope.categoryId !== null)
      .map((scope) => scope.categoryId!),
    includeProductSlugs: coupon.scopes
      .filter((scope) => scope.mode === "INCLUDE" && scope.product !== null)
      .map((scope) => scope.product!.slug)
      .join(", "),
    excludeProductSlugs: coupon.scopes
      .filter((scope) => scope.mode === "EXCLUDE" && scope.product !== null)
      .map((scope) => scope.product!.slug)
      .join(", "),
  };

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/admin/coupons" className="text-sm text-muted-foreground hover:underline">
        ← Coupons
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{coupon.code}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Used {coupon.usedCount} time{coupon.usedCount === 1 ? "" : "s"}
        {coupon.usageLimit === null ? "" : ` of ${coupon.usageLimit}`}.
      </p>
      <div className="mt-6">
        <CouponForm
          id={coupon.id}
          initial={initial}
          categories={categories}
          usedCount={coupon.usedCount}
        />
      </div>
    </div>
  );
}
