import { formatMoney } from "@/lib/money";
import { requireStaffPage } from "@/modules/access/access.service";
import { PAYMENT_LABELS, PRINT_LABELS, printLanguage } from "@/modules/invoices/invoice-labels";
import { getInvoiceForPrint } from "@/modules/invoices/invoice.service";
import { BarcodeSvg } from "@/modules/labels/components/barcode-svg";
import { forPage } from "../../../../../(dashboard)/page-guard";
import { PrintButton } from "../../../../transfers/[id]/print/print-button";

export const metadata = { title: "Invoice" };
export const dynamic = "force-dynamic";

const PRINT_CSS = "@page { size: A4; margin: 12mm; }";

/**
 * The invoice exactly as issued (its stored snapshot), on A4, in Bengali or
 * English (?lang=en). "Save as PDF" in the print dialog makes the PDF.
 */
export default async function InvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: string; lang?: string }>;
}) {
  const staff = await requireStaffPage("invoice.print");
  const { id } = await params;
  const query = await searchParams;
  const lang = printLanguage(query.lang);
  const t = PRINT_LABELS[lang];
  const {
    snapshot: inv,
    isCurrent,
    reason,
  } = await forPage(getInvoiceForPrint(staff, id, query.v));
  const money = (poisha: number) => formatMoney(poisha, lang, { numerals: "latin" });
  const date = (iso: string) =>
    new Intl.DateTimeFormat(lang === "bn" ? "bn-BD-u-nu-latn" : "en-GB", {
      timeZone: "Asia/Dhaka",
      dateStyle: "medium",
    }).format(new Date(iso));
  const shopName =
    (lang === "bn" ? inv.store.nameBn : inv.store.nameEn) || inv.store.nameEn || "US Export House";
  const shopAddress =
    (lang === "bn" ? inv.store.addressBn : inv.store.addressEn) || inv.store.addressEn;

  return (
    <main
      className="mx-auto max-w-[210mm] bg-white p-8 text-sm text-black print:p-0"
      lang={lang}
      data-testid="invoice"
    >
      <style>{PRINT_CSS}</style>
      <div className="mb-4 flex justify-end gap-3 print:hidden">
        <a className="underline" href={`?v=${inv.version}&lang=${lang === "bn" ? "en" : "bn"}`}>
          {lang === "bn" ? "English" : "বাংলা"}
        </a>
        <PrintButton />
      </div>
      {isCurrent ? null : (
        <p className="mb-3 border border-black px-3 py-2 font-semibold">
          {t.superseded}
          {reason === null ? "" : ` — ${reason}`}
        </p>
      )}
      <header className="flex items-start justify-between gap-6 border-b-2 border-black pb-4">
        <div>
          {inv.store.logoUrl === "" ? (
            <p className="text-2xl font-bold">{shopName}</p>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- printed logo from settings
            <img src={inv.store.logoUrl} alt={shopName} className="h-14 w-auto" />
          )}
          {shopAddress === "" ? null : (
            <p className="mt-1 max-w-xs whitespace-pre-line">{shopAddress}</p>
          )}
          {inv.store.phone === "" ? null : (
            <p>
              {t.phone}: {inv.store.phone}
            </p>
          )}
          {inv.store.bin === null ? null : (
            <p>
              {t.bin}: {inv.store.bin}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-xl font-bold uppercase">{t.invoice}</p>
          <p className="font-mono text-base font-semibold" data-testid="invoice-number">
            {inv.number}
          </p>
          {inv.version > 1 ? (
            <p>
              {t.version} {inv.version}
            </p>
          ) : null}
          <p>
            {t.order}: {inv.order.orderNumber}
          </p>
          <p>
            {t.date}: {date(inv.issuedAt)}
          </p>
          {inv.store.branchName === null ? null : (
            <p>
              {t.branch}: {inv.store.branchName}
            </p>
          )}
          <div className="mt-1 flex justify-end">
            <BarcodeSvg value={inv.number} kind="code128" heightMm={10} widthMm={55} />
          </div>
        </div>
      </header>

      <section className="mt-4">
        <p className="text-xs font-semibold uppercase">{t.billTo}</p>
        <p className="font-semibold">{inv.customer.name}</p>
        {inv.customer.phone === "" ? null : <p>{inv.customer.phone}</p>}
        {inv.customer.addressLines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </section>

      <table className="mt-4 w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-black text-left">
            <th className="py-1.5 pe-2">{t.item}</th>
            <th className="py-1.5 pe-2">{t.sku}</th>
            <th className="py-1.5 pe-2">{t.size}</th>
            <th className="py-1.5 pe-2">{t.colour}</th>
            <th className="py-1.5 pe-2 text-right">{t.qty}</th>
            <th className="py-1.5 pe-2 text-right">{t.unitPrice}</th>
            <th className="py-1.5 pe-2 text-right">{t.discount}</th>
            <th className="py-1.5 text-right">{t.amount}</th>
          </tr>
        </thead>
        <tbody>
          {inv.items.map((item, index) => (
            <tr key={`${item.sku}-${index}`} className="border-b border-black/30 align-top">
              <td className="py-1.5 pe-2">
                {lang === "bn" ? (item.nameBn ?? item.nameEn) : item.nameEn}
              </td>
              <td className="py-1.5 pe-2 font-mono text-xs">{item.sku}</td>
              <td className="py-1.5 pe-2">{item.sizeEn ?? "—"}</td>
              <td className="py-1.5 pe-2">{item.colourEn ?? "—"}</td>
              <td className="py-1.5 pe-2 text-right">{item.quantity}</td>
              <td className="py-1.5 pe-2 text-right">{money(item.unitPricePoisha)}</td>
              <td className="py-1.5 pe-2 text-right">
                {item.discountPoisha === 0 ? "—" : `−${money(item.discountPoisha)}`}
              </td>
              <td className="py-1.5 text-right">
                {money(item.lineTotalPoisha - item.discountPoisha)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 flex justify-end">
        <dl className="grid w-72 grid-cols-[1fr_auto] gap-x-4 gap-y-1">
          <dt>{t.subtotal}</dt>
          <dd className="text-right">{money(inv.totals.subtotalPoisha)}</dd>
          <dt>{t.discount}</dt>
          <dd className="text-right">−{money(inv.totals.discountPoisha)}</dd>
          <dt>{t.delivery}</dt>
          <dd className="text-right">{money(inv.totals.shippingPoisha)}</dd>
          <dt className="border-t-2 border-black pt-1 font-bold">{t.total}</dt>
          <dd
            className="border-t-2 border-black pt-1 text-right font-bold"
            data-testid="invoice-total"
          >
            {money(inv.totals.totalPoisha)}
          </dd>
          {inv.vat === null ? null : (
            <>
              <dt className="text-xs">
                {t.vatShare} ({inv.vat.ratePercent}%)
              </dt>
              <dd className="text-right text-xs">{money(inv.vat.includedPoisha)}</dd>
            </>
          )}
        </dl>
      </div>

      <section className="mt-4">
        <p>
          {t.payment}: {PAYMENT_LABELS[lang][inv.payment.method ?? ""] ?? inv.payment.method ?? "—"}{" "}
          · {PAYMENT_LABELS[lang][inv.payment.status] ?? inv.payment.status}
        </p>
        {inv.payment.lines.map((line, index) => (
          <p key={index} className="text-xs">
            {PAYMENT_LABELS[lang][line.provider] ?? line.provider}: {money(line.amountPoisha)}
            {line.reference === null ? "" : ` (${line.reference})`}
          </p>
        ))}
        {inv.soldBy === null ? null : (
          <p className="text-xs">
            {t.servedBy}: {inv.soldBy}
          </p>
        )}
      </section>

      <footer className="mt-8 border-t border-black pt-2 text-xs">
        <p>{t.vatIncluded}</p>
        <p>{t.thanks}</p>
      </footer>
    </main>
  );
}
