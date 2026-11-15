import { formatMoney } from "@/lib/money";
import { requireStaffPage } from "@/modules/access/access.service";
import { BarcodeSvg } from "@/modules/labels/components/barcode-svg";
import { getLabelSheet } from "@/modules/labels/labels.service";
import { forPage } from "../../../(dashboard)/page-guard";
import { PrintButton } from "../../transfers/[id]/print/print-button";

export const metadata = { title: "Barcode labels" };
export const dynamic = "force-dynamic";

/**
 * Barcode labels: one per page on a thermal label printer (size from
 * settings, default 38×25 mm), or a 3×8 A4 sticker sheet (?sheet=a4).
 * ?items=variantId:qty,... | ?product= | ?receipt= | ?transfer=
 */
export default async function LabelSheetPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const staff = await requireStaffPage("label.print");
  const query = await searchParams;
  const sheet = query.sheet === "a4";
  const { labels, missingBarcodes, widthMm, heightMm } = await forPage(getLabelSheet(staff, query));
  const css = sheet
    ? "@page { size: A4; margin: 10mm 5mm; } .labels { display: grid; grid-template-columns: repeat(3, 66mm); grid-auto-rows: 34mm; gap: 1mm; } .label { overflow: hidden; }"
    : `@page { size: ${widthMm}mm ${heightMm}mm; margin: 0; } .label { width: ${widthMm}mm; height: ${heightMm}mm; overflow: hidden; break-after: page; }`;

  return (
    <main className="bg-white p-2 text-black print:p-0">
      <style>{css}</style>
      <div className="mb-3 flex items-center justify-end gap-3 text-sm print:hidden">
        {missingBarcodes > 0 ? (
          <span className="text-red-700">
            {missingBarcodes} item(s) have no barcode: generate them on the Labels page first.
          </span>
        ) : null}
        <span>{labels.length} label(s)</span>
        <PrintButton />
      </div>
      <div className="labels">
        {labels.map((label, index) => (
          <div
            key={`${label.variantId}-${index}`}
            className="label flex flex-col items-center justify-center px-1 text-center leading-tight"
            data-testid="barcode-label"
          >
            <p className="w-full truncate text-[7pt] font-semibold">{label.name}</p>
            <p className="text-[6.5pt]">
              {[label.size, label.colour].filter(Boolean).join(" · ")}
              {" · "}
              <span className="font-bold">{formatMoney(label.pricePoisha, "en")}</span>
            </p>
            {label.barcode === null ? (
              <p className="text-[7pt]">NO BARCODE</p>
            ) : (
              <BarcodeSvg
                value={label.barcode}
                kind="ean13"
                heightMm={Math.max(6, (sheet ? 34 : heightMm) * 0.42)}
                widthMm={Math.min(34, (sheet ? 66 : widthMm) - 4)}
                testId="label-barcode"
              />
            )}
            <p className="font-mono text-[6.5pt]">
              {label.barcode ?? ""} · {label.sku}
            </p>
          </div>
        ))}
      </div>
    </main>
  );
}
