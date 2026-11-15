import { requireStaffPage } from "@/modules/access/access.service";
import { hasAnyPermission } from "@/modules/access/authorization";
import { countMissingBarcodes } from "@/modules/labels/labels.service";
import { LabelPicker } from "./label-picker";

export const metadata = { title: "Barcode labels" };
export const dynamic = "force-dynamic";

/**
 * Barcode labels: pick variants (scan or search) and quantities, or open the
 * print sheet straight from a product, stock receipt or transfer
 * (/admin/print/labels?product= | receipt= | transfer=).
 */
export default async function LabelsPage() {
  const staff = await requireStaffPage("label.print");
  const missing = hasAnyPermission(staff, ["label.print", "catalog.write"])
    ? await countMissingBarcodes(staff)
    : 0;
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">Barcode labels</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Thermal labels (size in settings, default 38×25 mm) or an A4 sticker sheet, printed from the
        browser. New variants get a barcode automatically; existing barcodes never change.
      </p>
      <LabelPicker missingBarcodes={missing} />
    </div>
  );
}
