/**
 * Stock transfer state machine and discrepancy rules — pure functions.
 *
 *   DRAFT ──(approve, only when transfer.requireApproval)──▶ APPROVED
 *   DRAFT / APPROVED ──dispatch──▶ DISPATCHED ──receive──▶ RECEIVED
 *   DRAFT / APPROVED ──cancel──▶ CANCELLED
 *
 * A dispatched transfer cannot be cancelled: goods that never arrive are
 * received as 0 with reason LOST, and goods going back travel on a new
 * transfer in the opposite direction.
 */

export type TransferStatus = "DRAFT" | "APPROVED" | "DISPATCHED" | "RECEIVED" | "CANCELLED";
export type TransferAction = "edit" | "approve" | "dispatch" | "receive" | "cancel";

export function canTransfer(
  status: TransferStatus,
  action: TransferAction,
  options: { requireApproval: boolean },
): boolean {
  switch (action) {
    case "edit":
      return status === "DRAFT";
    case "approve":
      return options.requireApproval && status === "DRAFT";
    case "dispatch":
      // An APPROVED transfer stays dispatchable if approval is later switched off.
      return options.requireApproval
        ? status === "APPROVED"
        : status === "DRAFT" || status === "APPROVED";
    case "receive":
      return status === "DISPATCHED";
    case "cancel":
      return status === "DRAFT" || status === "APPROVED";
  }
}

export function transferBlockedMessage(
  status: TransferStatus,
  action: TransferAction,
  options: { requireApproval: boolean },
): string {
  if (action === "dispatch" && options.requireApproval && status === "DRAFT") {
    return "This transfer must be approved before it can be dispatched.";
  }
  if (action === "approve" && !options.requireApproval) {
    return "Transfer approval is switched off; dispatch the transfer directly.";
  }
  if (action === "cancel" && status === "DISPATCHED") {
    return "A dispatched transfer cannot be cancelled. Receive it (0 with reason Lost if nothing arrived), or send the goods back on a new transfer.";
  }
  return `A ${status.toLowerCase()} transfer cannot be ${PAST_TENSE[action]}.`;
}

const PAST_TENSE: Record<TransferAction, string> = {
  edit: "edited",
  approve: "approved",
  dispatch: "dispatched",
  receive: "received",
  cancel: "cancelled",
};

// ---------------------------------------------------------------------------
// receiving
// ---------------------------------------------------------------------------

export const SHORTAGE_REASONS = ["LOST", "DAMAGED", "WRONG_ITEM"] as const;
export type ShortageReason = (typeof SHORTAGE_REASONS)[number];
export type DiscrepancyReason = ShortageReason | "EXCESS";

export const DISCREPANCY_REASON_LABELS: Record<DiscrepancyReason, string> = {
  LOST: "Lost in transit",
  DAMAGED: "Damaged",
  WRONG_ITEM: "Wrong item",
  EXCESS: "More than sent",
};

export interface LineDiscrepancy {
  /** received - sent: negative is a shortage, positive an excess. */
  difference: number;
  kind: "none" | "short" | "excess";
}

export function lineDiscrepancy(sent: number, received: number): LineDiscrepancy {
  const difference = received - sent;
  return { difference, kind: difference === 0 ? "none" : difference < 0 ? "short" : "excess" };
}

/**
 * Validates one received line. A shortage needs a reason (lost, damaged,
 * wrong item); an excess is always recorded as EXCESS. Returns the reason to
 * store, or an error message.
 */
export function resolveReceiveLine(
  sent: number,
  received: number,
  reason: ShortageReason | null | undefined,
): { reason: DiscrepancyReason | null } | { error: string } {
  if (!Number.isInteger(received) || received < 0) {
    return { error: "Received quantity must be a whole number, 0 or more." };
  }
  const { kind } = lineDiscrepancy(sent, received);
  if (kind === "none") return { reason: null };
  if (kind === "excess") return { reason: "EXCESS" };
  if (reason === null || reason === undefined) {
    return { error: "Choose why fewer arrived than were sent (lost, damaged or wrong item)." };
  }
  return { reason };
}
