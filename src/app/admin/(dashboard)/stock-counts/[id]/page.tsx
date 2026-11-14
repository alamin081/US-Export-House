import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/datetime";
import { requireStaffPage } from "@/modules/access/access.service";
import { SampleBadge } from "@/modules/inventory/components/sample-badge";
import { getCount } from "@/modules/inventory/stock-count.service";
import { forPage } from "../../page-guard";
import { CountScreen } from "./count-screen";

export const metadata = { title: "Stock count" };

const STATUS_LABEL: Record<string, string> = {
  IN_PROGRESS: "Counting",
  SUBMITTED: "Awaiting review",
  APPLIED: "Applied",
  CANCELLED: "Cancelled",
};

export default async function StockCountPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaffPage("inventory.read");
  const { id } = await params;
  const { count, lines, uncounted, can } = await forPage(getCount(staff, id));

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/admin/stock-counts" className="text-sm text-muted-foreground hover:underline">
        ← Stock counts
      </Link>
      <header className="mt-2 mb-5">
        <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight tabular-nums">
          {count.reference}
          <Badge variant="outline" data-testid="count-status" data-status={count.status}>
            {STATUS_LABEL[count.status] ?? count.status}
          </Badge>
          <SampleBadge show={count.location.isSample} />
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {count.location.code} · {count.category?.nameEn ?? "whole location"}
          {count.startedAt === null ? "" : ` · snapshot ${formatDateTime(count.startedAt, "en")}`}
          {count.submittedAt === null
            ? ""
            : ` · submitted ${formatDateTime(count.submittedAt, "en")}`}
          {count.completedAt === null
            ? ""
            : ` · applied ${formatDateTime(count.completedAt, "en")}`}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Expected = snapshot + sales, transfers and other movements made since the snapshot (until
          the line was counted). Difference = counted − expected; only differences are corrected.
        </p>
      </header>
      <CountScreen countId={count.id} lines={lines} can={can} uncounted={uncounted} />
    </div>
  );
}
