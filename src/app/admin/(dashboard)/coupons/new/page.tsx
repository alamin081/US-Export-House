import Link from "next/link";

import { requireStaffPage } from "@/modules/access/access.service";
import { listCouponCategoryChoices } from "@/modules/checkout-admin/checkout-admin.service";
import { forPage } from "../../page-guard";
import { CouponForm, EMPTY_COUPON } from "../coupon-form";

export const metadata = { title: "New coupon" };

export default async function NewCouponPage() {
  const staff = await requireStaffPage("coupon.manage");
  const categories = await forPage(listCouponCategoryChoices(staff));

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/admin/coupons" className="text-sm text-muted-foreground hover:underline">
        ← Coupons
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">New coupon</h1>
      <div className="mt-6">
        <CouponForm id={null} initial={EMPTY_COUPON} categories={categories} usedCount={0} />
      </div>
    </div>
  );
}
