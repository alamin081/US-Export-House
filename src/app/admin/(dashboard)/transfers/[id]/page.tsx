import Link from "next/link";
import { Printer } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { formatDateTime } from "@/lib/datetime";
import { requireStaffPage } from "@/modules/access/access.service";
import { SampleBadge } from "@/modules/inventory/components/sample-badge";
import { getTransfer, listTransferLocationOptions } from "@/modules/inventory/transfer.service";
import { DISCREPANCY_REASON_LABELS } from "@/modules/inventory/transfer-rules";
import { forPage } from "../../page-guard";
import { TransferDraftForm } from "../transfer-draft-form";
import { TransferStatusBadge } from "../transfer-status";
import { ReceiveTransferForm, TransferButtons } from "./transfer-actions";

export const metadata = { title: "Transfer" };

function who(user: { name: string | null; email: string | null } | null) {
  return user === null ? "—" : (user.name ?? user.email ?? "—");
}

export default async function TransferPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaffPage("transfer.create");
  const { id } = await params;
  const { transfer, can, requireApproval } = await forPage(getTransfer(staff, id));
  const itemName = (item: (typeof transfer.items)[number]) =>
    `${item.variant.product.nameEn}${item.variant.labelEn === null ? "" : ` — ${item.variant.labelEn}`}`;
  const excess = transfer.items.some((item) => item.discrepancyReason === "EXCESS");

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/admin/transfers" className="text-sm text-muted-foreground hover:underline">
        ← Transfers
      </Link>
      <header className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight tabular-nums">
            {transfer.reference}
            <TransferStatusBadge status={transfer.status} />
            <SampleBadge show={transfer.fromLocation.isSample || transfer.toLocation.isSample} />
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {transfer.fromLocation.code} ({transfer.fromLocation.nameEn}) →{" "}
            {transfer.toLocation.code} ({transfer.toLocation.nameEn})
            {requireApproval ? " · approval required before dispatch" : ""}
          </p>
        </div>
        <a
          href={`/admin/transfers/${transfer.id}/print`}
          target="_blank"
          rel="noopener"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Printer aria-hidden="true" />
          Print challan
        </a>
      </header>

      <dl className="mt-6 grid gap-3 rounded-lg border border-border bg-background p-5 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Created</dt>
          <dd>
            {formatDateTime(transfer.createdAt, "en")} · {who(transfer.createdBy)}
          </dd>
        </div>
        {transfer.approvedAt === null ? null : (
          <div>
            <dt className="text-muted-foreground">Approved</dt>
            <dd>
              {formatDateTime(transfer.approvedAt, "en")} · {who(transfer.approvedBy)}
            </dd>
          </div>
        )}
        {transfer.dispatchedAt === null ? null : (
          <div>
            <dt className="text-muted-foreground">Dispatched</dt>
            <dd>
              {formatDateTime(transfer.dispatchedAt, "en")} · {who(transfer.dispatchedBy)}
            </dd>
          </div>
        )}
        {transfer.receivedAt === null ? null : (
          <div>
            <dt className="text-muted-foreground">Received</dt>
            <dd>
              {formatDateTime(transfer.receivedAt, "en")} · {who(transfer.receivedBy)}
            </dd>
          </div>
        )}
        {transfer.cancelledAt === null ? null : (
          <div>
            <dt className="text-muted-foreground">Cancelled</dt>
            <dd>
              {formatDateTime(transfer.cancelledAt, "en")} · {who(transfer.cancelledBy)} —{" "}
              {transfer.cancelReason}
            </dd>
          </div>
        )}
        {transfer.note === null ? null : (
          <div className="sm:col-span-4">
            <dt className="text-muted-foreground">Note</dt>
            <dd className="whitespace-pre-line">{transfer.note}</dd>
          </div>
        )}
      </dl>

      {excess ? (
        <p role="note" className="mt-4 rounded-md border border-accent bg-accent/30 p-3 text-sm">
          More arrived than was sent on at least one line. Count that item at{" "}
          {transfer.fromLocation.code}: its stock there is probably overstated.
        </p>
      ) : null}

      <div className="mt-6">
        <TransferButtons transferId={transfer.id} can={can} />
      </div>

      {can.receive ? (
        <section className="mt-6 rounded-lg border border-border bg-background p-5">
          <h2 className="mb-4 text-sm font-semibold">Receive at {transfer.toLocation.code}</h2>
          <ReceiveTransferForm
            transferId={transfer.id}
            items={transfer.items.map((item) => ({
              id: item.id,
              variantId: item.variantId,
              sku: item.variant.sku,
              name: itemName(item),
              quantitySent: item.quantitySent,
            }))}
          />
        </section>
      ) : can.edit ? (
        <section className="mt-6">
          <h2 className="mb-4 text-sm font-semibold">Edit draft</h2>
          <TransferDraftForm
            locations={await listTransferLocationOptions(staff)}
            initial={{
              id: transfer.id,
              fromLocationId: transfer.fromLocationId,
              toLocationId: transfer.toLocationId,
              note: transfer.note ?? "",
              lines: transfer.items.map((item) => ({
                variantId: item.variantId,
                sku: item.variant.sku,
                name: itemName(item),
                quantity: item.quantitySent,
              })),
            }}
          />
        </section>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-background">
          <table className="w-full min-w-[40rem] text-sm" data-testid="transfer-items">
            <thead className="bg-secondary/60 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Item</th>
                <th className="px-4 py-2.5 text-right font-medium">Sent</th>
                <th className="px-4 py-2.5 text-right font-medium">Received</th>
                <th className="px-4 py-2.5 font-medium">Discrepancy</th>
              </tr>
            </thead>
            <tbody>
              {transfer.items.map((item) => (
                <tr key={item.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <span className="block font-medium tabular-nums">{item.variant.sku}</span>
                    <span className="text-xs text-muted-foreground">{itemName(item)}</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{item.quantitySent}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {item.quantityReceived ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {item.discrepancy === null || item.discrepancy.kind === "none" ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <Badge variant={item.discrepancy.kind === "short" ? "destructive" : "accent"}>
                        {item.discrepancy.difference > 0
                          ? `+${item.discrepancy.difference}`
                          : item.discrepancy.difference}{" "}
                        {item.discrepancyReason === null
                          ? ""
                          : DISCREPANCY_REASON_LABELS[item.discrepancyReason]}
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
