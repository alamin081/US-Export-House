import { redirect } from "next/navigation";

import { requireStaffPage } from "@/modules/access/access.service";

/** Checkout and store settings moved to the Settings page in Phase 12. */
export default async function CheckoutSettingsPage() {
  await requireStaffPage("checkout.settings");
  redirect("/admin/settings?group=checkout");
}
