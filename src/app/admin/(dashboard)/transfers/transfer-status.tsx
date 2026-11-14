import { Badge } from "@/components/ui/badge";

const LABELS: Record<
  string,
  { label: string; variant: "outline" | "muted" | "accent" | "success" | "solid" }
> = {
  DRAFT: { label: "Draft", variant: "outline" },
  APPROVED: { label: "Approved", variant: "solid" },
  DISPATCHED: { label: "In transit", variant: "accent" },
  RECEIVED: { label: "Received", variant: "success" },
  CANCELLED: { label: "Cancelled", variant: "muted" },
};

export function TransferStatusBadge({ status }: { status: string }) {
  const entry = LABELS[status] ?? { label: status, variant: "outline" as const };
  return (
    <Badge variant={entry.variant} data-testid="transfer-status" data-status={status}>
      {entry.label}
    </Badge>
  );
}
