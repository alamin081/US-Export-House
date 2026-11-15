import { requireStaffPage } from "@/modules/access/access.service";
import { BarcodeSvg } from "@/modules/labels/components/barcode-svg";
import { getOrdersForPrint } from "@/modules/orders/orders.service";
import { getStoreSettings } from "@/modules/settings/settings.service";
import { forPage } from "../../../../(dashboard)/page-guard";
import { PrintButton } from "../../../transfers/[id]/print/print-button";

export const metadata = { title: "Packing slips" };
export const dynamic = "force-dynamic";

/**
 * Packing slips, one per page: no prices, the items to pack, the delivery
 * address and the order number as a barcode. Independent of the invoice,
 * so they print before an order ships.
 */
export default async function PackingSlipsPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const staff = await requireStaffPage("invoice.print");
  const { ids } = await searchParams;
  const [{ orders, paperSize }, store] = await Promise.all([
    forPage(getOrdersForPrint(staff, ids ?? "")),
    getStoreSettings(),
  ]);
  const css = `@page { size: ${paperSize}; margin: 10mm; } @media print { .slip + .slip { break-before: page; } }`;

  return (
    <main className="mx-auto max-w-[210mm] bg-white p-6 text-black print:p-0">
      <style>{css}</style>
      <div className="mb-4 flex justify-end print:hidden">
        <PrintButton />
      </div>
      {orders.map((order) => (
        <section
          key={order.id}
          className="slip mb-8 border border-black p-6 text-sm print:mb-0 print:border-0 print:p-0"
          data-testid="packing-slip"
        >
          <header className="flex items-start justify-between gap-4 border-b border-black pb-3">
            <div>
              <p className="text-lg font-bold">{store.nameEn || "US Export House"}</p>
              <p className="text-xs">Packing slip — no prices</p>
              {store.contactPhone === "" ? null : <p className="text-xs">{store.contactPhone}</p>}
            </div>
            <div className="text-right">
              <BarcodeSvg value={order.orderNumber} kind="code128" heightMm={12} widthMm={60} />
              <p className="font-mono text-base font-bold">{order.orderNumber}</p>
              <p className="text-xs">From {order.location.code}</p>
            </div>
          </header>

          <div className="mt-3">
            <p className="text-xs font-semibold uppercase">Deliver to</p>
            <p className="font-semibold">{order.shipName ?? order.customerName}</p>
            <p>{order.shipPhone ?? order.customerPhone}</p>
            <p>{order.shipLine1}</p>
            {order.shipLandmark === null ? null : <p>Near {order.shipLandmark}</p>}
            <p>
              {[order.shipUpazilaName, order.shipDistrictName, order.shipDivisionName]
                .filter(Boolean)
                .join(", ")}
            </p>
            {order.deliveryNote === null ? null : (
              <p className="mt-1">Note: {order.deliveryNote}</p>
            )}
          </div>

          <table className="mt-4 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-black text-left">
                <th className="py-1">✓</th>
                <th className="py-1">Item</th>
                <th className="py-1">SKU</th>
                <th className="py-1">Size</th>
                <th className="py-1">Colour</th>
                <th className="py-1 text-right">Qty</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id} className="border-b border-black/30">
                  <td className="py-1.5 pe-2">☐</td>
                  <td className="py-1.5">{item.productNameEn}</td>
                  <td className="py-1.5 font-mono text-xs">{item.sku}</td>
                  <td className="py-1.5">{item.sizeLabelEn ?? "—"}</td>
                  <td className="py-1.5">{item.colourLabelEn ?? "—"}</td>
                  <td className="py-1.5 text-right font-semibold">{item.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-right text-xs">
            {order.items.reduce((sum, item) => sum + item.quantity, 0)} unit(s)
          </p>
          <footer className="mt-6 grid grid-cols-2 gap-6 text-xs">
            <p className="border-t border-black pt-1">Packed by</p>
            <p className="border-t border-black pt-1">Checked by</p>
          </footer>
        </section>
      ))}
    </main>
  );
}
