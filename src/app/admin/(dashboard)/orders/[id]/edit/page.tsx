import Link from "next/link";
import { redirect } from "next/navigation";

import { requireStaffPage } from "@/modules/access/access.service";
import { getOrderForStaff } from "@/modules/orders/orders.service";
import { listDistricts, listDivisions, listUpazilas } from "@/modules/shipping/shipping.service";
import { forPage } from "../../../page-guard";
import { EditOrderForm } from "./edit-form";

export const metadata = { title: "Edit order" };

/**
 * Before packing: items, quantities, sizes/colours, address and note (one
 * transaction, money recalculated). After packing: only the address can be
 * corrected, and the money stays as it is.
 */
export default async function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const staff = await requireStaffPage("order.edit");
  const { order, actions } = await forPage(getOrderForStaff(staff, id));
  if (!actions.edit && !actions.correctAddress) redirect(`/admin/orders/${id}`);
  const [divisions, districts, upazilas] = await Promise.all([
    listDivisions(),
    order.shipDivisionId === null ? Promise.resolve([]) : listDistricts(order.shipDivisionId),
    order.shipDistrictId === null ? Promise.resolve([]) : listUpazilas(order.shipDistrictId),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <Link href={`/admin/orders/${id}`} className="text-sm text-muted-foreground hover:underline">
        ← {order.orderNumber}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">
        {actions.edit ? "Edit order" : "Correct the delivery address"}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {actions.edit
          ? "Lines already on the order keep the price the customer was quoted; a new size, colour or item takes today's price. The coupon is checked again and removed if it no longer applies."
          : "The order is packed or shipped: prices and the delivery charge stay as they are. If an invoice exists, a new version with the same number is issued."}
      </p>
      <EditOrderForm
        mode={actions.edit ? "edit" : "correct"}
        order={{
          id: order.id,
          version: order.version,
          customerName: order.customerName,
          street: order.shipLine1 ?? "",
          landmark: order.shipLandmark ?? "",
          deliveryNote: order.deliveryNote ?? "",
          area: {
            divisionId: order.shipDivisionId ?? "",
            districtId: order.shipDistrictId ?? "",
            upazilaId: order.shipUpazilaId ?? "",
          },
          lines: order.items
            .filter((item) => item.variantId !== null)
            .map((item) => ({
              variantId: item.variantId!,
              sku: item.sku,
              name: [item.productNameEn, item.sizeLabelEn, item.colourLabelEn]
                .filter(Boolean)
                .join(" · "),
              quantity: item.quantity,
              unitPricePoisha: item.unitPricePoisha,
            })),
        }}
        divisions={divisions.map((row) => ({ id: row.id, name: row.nameEn }))}
        districts={districts.map((row) => ({ id: row.id, name: row.nameEn }))}
        upazilas={upazilas.map((row) => ({ id: row.id, name: row.nameEn }))}
      />
    </div>
  );
}
