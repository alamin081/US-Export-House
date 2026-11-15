import { NextResponse } from "next/server";

import { isAppError } from "@/lib/errors";
import { requireStaffApi } from "@/modules/access/api-guard";
import { requestMetaFromHeaders } from "@/modules/access/request-meta";
import { csvFileName, csvStream, type CsvColumn } from "@/modules/reports/report-csv";
import {
  auditSoldOrdersExport,
  soldOrderPages,
  type SoldOrderRow,
} from "@/modules/reports/reports.service";

/**
 * Every order sold in the period, one row each — the large export. Streamed
 * page by page (1,000 orders at a time), so it never sits in memory whole.
 * No customer name, phone or address: the sales export is about money.
 */
export const dynamic = "force-dynamic";

const COLUMNS: CsvColumn<SoldOrderRow>[] = [
  { header: "Order", kind: "text", value: (row) => row.orderNumber },
  { header: "Sold at", kind: "datetime", value: (row) => row.soldAt },
  {
    header: "Channel",
    kind: "text",
    value: (row) => (row.channel === "ONLINE" ? "Online" : "In store"),
  },
  { header: "Location", kind: "text", value: (row) => row.location.code },
  { header: "Status", kind: "text", value: (row) => row.status },
  { header: "Payment", kind: "text", value: (row) => row.paymentMethod },
  { header: "Coupon", kind: "text", value: (row) => row.couponCode },
  { header: "Subtotal (Tk)", kind: "money", value: (row) => row.subtotalPoisha },
  { header: "Discount (Tk)", kind: "money", value: (row) => row.discountPoisha },
  { header: "Delivery (Tk)", kind: "money", value: (row) => row.shippingPoisha },
  { header: "Total (Tk)", kind: "money", value: (row) => row.totalPoisha },
  { header: "Refunded (Tk)", kind: "money", value: (row) => row.refundedPoisha },
];

export async function GET(request: Request) {
  const guard = await requireStaffApi("report.export");
  if ("response" in guard) return guard.response;
  const query = Object.fromEntries(new URL(request.url).searchParams.entries());
  try {
    const filters = await auditSoldOrdersExport(
      guard.staff,
      query,
      requestMetaFromHeaders(request.headers),
    );
    const name = csvFileName("sales-orders", filters.range.fromKey, filters.range.toKey);
    return new NextResponse(csvStream(COLUMNS, soldOrderPages(guard.staff, query)), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${name}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (isAppError(error)) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message } },
        { status: error.httpStatus, headers: { "cache-control": "no-store" } },
      );
    }
    throw error;
  }
}
