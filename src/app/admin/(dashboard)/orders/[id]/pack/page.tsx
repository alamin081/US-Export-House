import Link from "next/link";
import { redirect } from "next/navigation";

import { requireStaffPage } from "@/modules/access/access.service";
import { getOrderForStaff } from "@/modules/orders/orders.service";
import { forPage } from "../../../page-guard";
import { PackScreen } from "./pack-screen";

export const metadata = { title: "Pack order" };

/** Scan every item into the parcel; a wrong item is flagged and never counted. */
export default async function PackOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staff = await requireStaffPage("order.fulfil");
  const { order, actions } = await forPage(getOrderForStaff(staff, id));
  if (!actions.pack) redirect(`/admin/orders/${id}`);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/admin/orders/${id}`} className="text-sm text-muted-foreground hover:underline">
        ← {order.orderNumber}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Pack {order.orderNumber}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Scan each item as it goes into the parcel. Without a scanner, use + to count by hand.
      </p>
      <PackScreen
        orderId={order.id}
        version={order.version}
        items={order.items
          .filter((item) => item.variantId !== null)
          .map((item) => ({
            variantId: item.variantId!,
            sku: item.sku,
            name: [item.productNameEn, item.sizeLabelEn, item.colourLabelEn]
              .filter(Boolean)
              .join(" · "),
            quantity: item.quantity,
          }))}
      />
    </div>
  );
}
