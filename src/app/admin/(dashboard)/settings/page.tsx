import { requireStaffPage } from "@/modules/access/access.service";
import { AdminPlaceholder } from "../admin-placeholder";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireStaffPage("settings.write");

  return (
    <AdminPlaceholder
      title="Settings"
      phase={12}
      description={
        "The business rules this system deliberately does not hardcode: shipping, returns, OTP and payments."
      }
      layout="form"
      features={[
        "Shipping zones, rates and the free-shipping threshold",
        "Return window and return conditions text",
        "OTP length and lifetime, rate limits",
        "Payment and courier provider modes",
        "Order number format and invoice details",
        "Every change written to the audit log",
      ]}
    />
  );
}
