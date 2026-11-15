import { Badge } from "@/components/ui/badge";

/** Labels and badges shared by the order screens (server-safe, no hooks). */

export const STATUS_LABELS: Record<string, string> = {
  PENDING: "New",
  CONFIRMED: "Confirmed",
  PROCESSING: "Packing",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  RETURNED: "Returned",
  DELIVERY_FAILED: "Delivery failed",
  RETURNED_TO_WAREHOUSE: "Back in warehouse",
};

export const CALL_OUTCOME_LABELS: Record<string, string> = {
  CONFIRMED: "Answered — confirmed",
  NO_ANSWER: "No answer",
  SWITCHED_OFF: "Phone switched off",
  WRONG_NUMBER: "Wrong number",
  CALL_BACK_LATER: "Asked to call back later",
  CANCEL_REQUESTED: "Wants to cancel",
};

export const REVIEW_TEXT: Record<string, string> = {
  LARGE_QUANTITY: "Many items in one order",
  FIRST_ORDER_HIGH_VALUE: "First order from this phone, high value",
};

export function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "CANCELLED" || status === "DELIVERY_FAILED"
      ? "destructive"
      : status === "DELIVERED"
        ? "success"
        : status === "PENDING"
          ? "accent"
          : "outline";
  return (
    <Badge variant={variant} data-testid="order-status">
      {STATUS_LABELS[status] ?? status.toLowerCase()}
    </Badge>
  );
}

export function dhaka(date: Date | string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}
