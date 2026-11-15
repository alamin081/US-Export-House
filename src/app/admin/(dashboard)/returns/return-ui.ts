/** Labels shared by the return screens. */

export const RETURN_STATUS_LABELS: Record<string, string> = {
  REQUESTED: "Requested",
  APPROVED: "Approved",
  REJECTED: "Refused",
  RECEIVED: "Received",
  INSPECTED: "Inspected",
  COMPLETED: "Closed",
  CANCELLED: "Cancelled",
};

export const INSPECTION_LABELS: Record<string, string> = {
  PENDING: "Not inspected",
  ACCEPTED: "Back in stock",
  DAMAGED: "Damaged — written off",
  REJECTED: "Not accepted",
};
