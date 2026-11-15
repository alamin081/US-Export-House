import { redirect } from "next/navigation";

import { requireStaffPage } from "@/modules/access/access.service";

/**
 * The return policy is written, approved and published in the content editor
 * since Phase 12 (publishing it still needs return.policy.publish). This old
 * address forwards there.
 */
export default async function ReturnPolicyPage() {
  await requireStaffPage("content.write");
  redirect("/admin/content/page.shipping-returns");
}
