import "server-only";

import { db } from "@/lib/db";

/** An invoice version (the current one when `version` is null), with its order's location. */
export async function findInvoice(orderId: string, version: number | null) {
  return db.invoice.findFirst({
    where: { orderId, ...(version === null ? { isCurrent: true } : { version }) },
    include: { order: { select: { locationId: true } } },
  });
}
