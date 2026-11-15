import { formatMoney } from "@/lib/money";
import { requireStaffPage } from "@/modules/access/access.service";
import { PAYMENT_LABELS, PRINT_LABELS, printLanguage } from "@/modules/invoices/invoice-labels";
import { BarcodeSvg } from "@/modules/labels/components/barcode-svg";
import { getReceipt } from "@/modules/pos/pos.service";
import { getReturnsSettings, getStoreSettings } from "@/modules/settings/settings.service";
import { forPage } from "../../../../../(dashboard)/page-guard";
import { PrintButton } from "../../../../transfers/[id]/print/print-button";

export const metadata = { title: "Receipt" };
export const dynamic = "force-dynamic";

/**
 * Till receipt for an 80 mm (or 58 mm, setting) thermal printer, printed
 * from the browser. Bengali by default, English with ?lang=en.
 */
export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const staff = await requireStaffPage("pos.sell");
  const { id } = await params;
  const lang = printLanguage((await searchParams).lang);
  const t = PRINT_LABELS[lang];
  const [{ sale, widthMm }, store, returns] = await Promise.all([
    forPage(getReceipt(staff, id)),
    getStoreSettings(),
    getReturnsSettings(),
  ]);
  const money = (poisha: number) => formatMoney(poisha, lang, { numerals: "latin" });
  const bill = sale.invoices[0]?.number ?? sale.orderNumber;
  const css = `@page { size: ${widthMm}mm auto; margin: 2mm; } body { margin: 0; }`;
  const shopName =
    (lang === "bn" ? store.nameBn : store.nameEn) || store.nameEn || "US Export House";

  return (
    <main
      className="mx-auto bg-white p-2 font-mono text-[11px] leading-snug text-black"
      style={{ width: `${widthMm - 4}mm` }}
      lang={lang}
      data-testid="receipt"
    >
      <style>{css}</style>
      <div className="mb-2 flex justify-end gap-2 font-sans print:hidden">
        <a className="underline" href={`?lang=${lang === "bn" ? "en" : "bn"}`}>
          {lang === "bn" ? "English" : "বাংলা"}
        </a>
        <PrintButton />
      </div>
      <p className="text-center text-sm font-bold">{shopName}</p>
      <p className="text-center">
        {t.branch}: {sale.location.nameEn}
      </p>
      {store.contactPhone === "" ? null : <p className="text-center">{store.contactPhone}</p>}
      {store.vatEnabled && store.vatBin !== "" ? (
        <p className="text-center">
          {t.bin}: {store.vatBin}
        </p>
      ) : null}
      <hr className="my-1 border-dashed border-black" />
      <p>
        {t.billNo}: <span data-testid="receipt-bill">{bill}</span>
      </p>
      <p>
        {t.date}:{" "}
        {new Intl.DateTimeFormat("en-GB", {
          timeZone: "Asia/Dhaka",
          dateStyle: "short",
          timeStyle: "short",
        }).format(sale.placedAt)}
      </p>
      {sale.soldBy?.name ? (
        <p>
          {t.servedBy}: {sale.soldBy.name}
        </p>
      ) : null}
      <hr className="my-1 border-dashed border-black" />
      {sale.items.map((item) => (
        <div key={item.id} className="mb-1">
          <p>{lang === "bn" ? (item.productNameBn ?? item.productNameEn) : item.productNameEn}</p>
          <p className="flex justify-between">
            <span>
              {item.quantity} × {money(item.unitPricePoisha)}
              {[item.sizeLabelEn, item.colourLabelEn].filter(Boolean).length > 0
                ? ` (${[item.sizeLabelEn, item.colourLabelEn].filter(Boolean).join("/")})`
                : ""}
            </span>
            <span>{money(item.lineTotalPoisha)}</span>
          </p>
          {item.discountPoisha > 0 ? (
            <p className="flex justify-between">
              <span>{t.discount}</span>
              <span>−{money(item.discountPoisha)}</span>
            </p>
          ) : null}
        </div>
      ))}
      <hr className="my-1 border-dashed border-black" />
      <p className="flex justify-between">
        <span>{t.subtotal}</span>
        <span>{money(sale.subtotalPoisha)}</span>
      </p>
      <p className="flex justify-between">
        <span>{t.discount}</span>
        <span>−{money(sale.discountPoisha)}</span>
      </p>
      <p className="flex justify-between text-sm font-bold">
        <span>{t.total}</span>
        <span data-testid="receipt-total">{money(sale.totalPoisha)}</span>
      </p>
      <hr className="my-1 border-dashed border-black" />
      {sale.payments.map((payment) => (
        <div key={payment.id}>
          <p className="flex justify-between">
            <span>{PAYMENT_LABELS[lang][payment.provider] ?? payment.provider}</span>
            <span>{money(payment.tenderedPoisha ?? payment.amountPoisha)}</span>
          </p>
          {payment.changePoisha !== null && payment.changePoisha > 0 ? (
            <p className="flex justify-between">
              <span>{t.change}</span>
              <span data-testid="receipt-change">{money(payment.changePoisha)}</span>
            </p>
          ) : null}
        </div>
      ))}
      <hr className="my-1 border-dashed border-black" />
      <p>{t.vatIncluded}</p>
      <p>{lang === "bn" ? returns.conditionsBn : returns.conditionsEn}</p>
      <p className="mt-1 text-center">{t.thanks}</p>
      <div className="mt-1 flex justify-center">
        <BarcodeSvg value={bill} kind="code128" heightMm={9} widthMm={Math.min(60, widthMm - 8)} />
      </div>
    </main>
  );
}
