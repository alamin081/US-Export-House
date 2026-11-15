import { formatMoney } from "@/lib/money";
import { requireStaffPage } from "@/modules/access/access.service";
import { BarcodeSvg } from "@/modules/labels/components/barcode-svg";
import { getOrdersForPrint } from "@/modules/orders/orders.service";
import { getStoreSettings } from "@/modules/settings/settings.service";
import { forPage } from "../../../../(dashboard)/page-guard";
import { PrintButton } from "../../../transfers/[id]/print/print-button";

export const metadata = { title: "Address labels" };
export const dynamic = "force-dynamic";

/**
 * Parcel labels: order number (barcode), name, phone, address and the cash to
 * collect. ?size=a6 prints one 100×150 mm label per page (thermal); the
 * default puts four on an A4 sheet.
 */
export default async function AddressLabelsPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string; size?: string }>;
}) {
  const staff = await requireStaffPage("invoice.print");
  const query = await searchParams;
  const thermal = query.size === "a6";
  const [{ orders }, store] = await Promise.all([
    forPage(getOrdersForPrint(staff, query.ids ?? "")),
    getStoreSettings(),
  ]);
  const css = thermal
    ? "@page { size: 100mm 150mm; margin: 4mm; } .label { height: 140mm; } .label + .label { break-before: page; }"
    : "@page { size: A4; margin: 8mm; } .sheet { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; } .label { height: 135mm; break-inside: avoid; }";

  return (
    <main className="mx-auto max-w-[210mm] bg-white p-4 text-black print:p-0">
      <style>{css}</style>
      <div className="mb-4 flex justify-end gap-3 text-sm print:hidden">
        <a className="underline" href={`?ids=${query.ids ?? ""}${thermal ? "" : "&size=a6"}`}>
          {thermal ? "A4 sheet (4 per page)" : "Thermal 100×150 mm"}
        </a>
        <PrintButton />
      </div>
      <div className={thermal ? "" : "sheet"}>
        {orders.map((order) => {
          const shipment = order.shipments[0];
          const cod =
            shipment?.codAmountPoisha ?? Math.max(0, order.totalPoisha - order.paidPoisha);
          return (
            <section
              key={order.id}
              className="label flex flex-col border-2 border-black p-4 text-sm"
              data-testid="address-label"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs">
                  From: {store.nameEn || "US Export House"}
                  {store.contactPhone === "" ? "" : ` · ${store.contactPhone}`}
                </p>
                <p className="font-mono text-xs">{order.location.code}</p>
              </div>
              <BarcodeSvg value={order.orderNumber} kind="code128" heightMm={14} widthMm={70} />
              <p className="font-mono text-lg font-bold">{order.orderNumber}</p>
              <div className="mt-2 flex-1">
                <p className="text-lg font-bold">{order.shipName ?? order.customerName}</p>
                <p className="text-base font-semibold">{order.shipPhone ?? order.customerPhone}</p>
                <p>{order.shipLine1}</p>
                {order.shipLandmark === null ? null : <p>Near {order.shipLandmark}</p>}
                <p className="font-semibold">
                  {[order.shipUpazilaName, order.shipDistrictName].filter(Boolean).join(", ")}
                </p>
              </div>
              <p className="mt-2 border-t-2 border-black pt-2 text-lg font-bold">
                {order.paymentMethod === "COD" && cod > 0
                  ? `COD: ${formatMoney(cod, "en")}`
                  : "PAID — collect nothing"}
              </p>
              {shipment?.trackingCode ? (
                <p className="font-mono text-xs">{shipment.trackingCode}</p>
              ) : null}
            </section>
          );
        })}
      </div>
    </main>
  );
}
