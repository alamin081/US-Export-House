/** Cancel reasons and their labels — shared by the service and the admin screens. */

export const CANCEL_REASONS = [
  "CUSTOMER_DECLINED",
  "FAKE_ORDER",
  "UNREACHABLE",
  "OUT_OF_STOCK",
  "OTHER",
] as const;

export const CANCEL_REASON_LABELS: Record<(typeof CANCEL_REASONS)[number], string> = {
  CUSTOMER_DECLINED: "Customer does not want it",
  FAKE_ORDER: "Fake order",
  UNREACHABLE: "Could not reach the customer",
  OUT_OF_STOCK: "Out of stock",
  OTHER: "Other",
};
