import { formatDateTime } from "@/lib/datetime";
import { requireStaffPage } from "@/modules/access/access.service";
import { getTransfer } from "@/modules/inventory/transfer.service";
import { forPage } from "../../../../(dashboard)/page-guard";
import { PrintButton } from "./print-button";

export const metadata = { title: "Transfer challan" };
export const dynamic = "force-dynamic";

const COPIES = ["Sender copy", "Receiver copy"] as const;

const PRINT_CSS =
  "@page { size: A4; margin: 12mm; } @media print { .challan + .challan { break-before: page; } }";

/**
 * Printable transfer challan: two copies on A4 (the sender keeps one, the
 * other travels with the goods). Rendered outside the admin shell so only the
 * challan prints.
 */
export default async function TransferChallanPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaffPage("transfer.create");
  const { id } = await params;
  const { transfer } = await forPage(getTransfer(staff, id));
  const units = transfer.items.reduce((total, item) => total + item.quantitySent, 0);
  const sample = transfer.fromLocation.isSample || transfer.toLocation.isSample;

  return (
    <main className="mx-auto max-w-[210mm] bg-white p-6 text-black print:p-0">
      <style>{PRINT_CSS}</style>
      <div className="mb-4 flex justify-end print:hidden">
        <PrintButton />
      </div>
      {COPIES.map((copy) => (
        <section
          key={copy}
          className="challan mb-8 border border-black p-6 text-sm print:mb-0 print:border-0 print:p-0"
        >
          <header className="flex items-start justify-between border-b border-black pb-3">
            <div>
              <p className="text-lg font-bold">US Export House</p>
              <p className="text-xs">Stock transfer challan{sample ? " — SAMPLE DATA" : ""}</p>
            </div>
            <div className="text-right">
              <p className="font-mono text-base font-bold">{transfer.reference}</p>
              <p className="text-xs uppercase">{copy}</p>
              <p className="text-xs">Status: {transfer.status}</p>
            </div>
          </header>

          <div className="mt-3 grid grid-cols-2 gap-4">
            {[
              { title: "From", location: transfer.fromLocation },
              { title: "To", location: transfer.toLocation },
            ].map(({ title, location }) => (
              <div key={title}>
                <p className="text-xs font-semibold uppercase">{title}</p>
                <p className="font-semibold">
                  {location.code} — {location.nameEn}
                </p>
                {location.addressEn === null ? null : (
                  <p className="text-xs">{location.addressEn}</p>
                )}
                {location.phone === null ? null : <p className="text-xs">{location.phone}</p>}
              </div>
            ))}
          </div>

          <p className="mt-3 text-xs">
            Created {formatDateTime(transfer.createdAt, "en")}
            {transfer.dispatchedAt === null
              ? ""
              : ` · Dispatched ${formatDateTime(transfer.dispatchedAt, "en")}`}
            {transfer.note === null ? "" : ` · Note: ${transfer.note}`}
          </p>

          <table className="mt-3 w-full border-collapse text-xs">
            <thead>
              <tr className="border-y border-black text-left">
                <th className="py-1.5 pe-2">#</th>
                <th className="py-1.5 pe-2">SKU</th>
                <th className="py-1.5 pe-2">Item</th>
                <th className="py-1.5 pe-2 text-right">Sent</th>
                <th className="py-1.5 text-right">Received</th>
              </tr>
            </thead>
            <tbody>
              {transfer.items.map((item, index) => (
                <tr key={item.id} className="border-b border-black/30">
                  <td className="py-1.5 pe-2">{index + 1}</td>
                  <td className="py-1.5 pe-2 font-mono">{item.variant.sku}</td>
                  <td className="py-1.5 pe-2">
                    {item.variant.product.nameEn}
                    {item.variant.labelEn === null ? "" : ` — ${item.variant.labelEn}`}
                  </td>
                  <td className="py-1.5 pe-2 text-right">{item.quantitySent}</td>
                  <td className="py-1.5 text-right">{item.quantityReceived ?? "______"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-black font-semibold">
                <td colSpan={3} className="py-1.5">
                  {transfer.items.length} lines
                </td>
                <td className="py-1.5 pe-2 text-right">{units}</td>
                <td />
              </tr>
            </tfoot>
          </table>

          <div className="mt-10 grid grid-cols-3 gap-6 text-xs">
            {[
              "Dispatched by (sign, date)",
              "Carried by (sign, date)",
              "Received by (sign, date)",
            ].map((label) => (
              <div key={label} className="border-t border-black pt-1">
                {label}
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
