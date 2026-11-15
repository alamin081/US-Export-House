import "server-only";

/**
 * Outgoing notifications. Phases 8-9 only record that an event happened (no
 * SMS, no email yet); a later phase plugs a real sender in here. Events carry
 * no personal data: never a phone number, name or address.
 */

export type NotificationEvent =
  | { type: "order.placed"; orderNumber: string; totalPoisha: number }
  | { type: "order.confirmed"; orderNumber: string; totalPoisha: number }
  | { type: "order.updated"; orderNumber: string; totalPoisha: number }
  | { type: "order.cancelled"; orderNumber: string; reason: string }
  | { type: "order.shipped"; orderNumber: string; courier: string; codAmountPoisha: number }
  | { type: "order.delivered"; orderNumber: string }
  | { type: "order.delivery_failed"; orderNumber: string };

/** One log line per event: the type, the order number and amounts only. */
function describe(event: NotificationEvent): string {
  const { type, orderNumber, ...rest } = event;
  const extra = Object.entries(rest)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");
  return `[notify] ${type} ${orderNumber}${extra === "" ? "" : ` ${extra}`}`;
}

type Sink = (event: NotificationEvent) => void | Promise<void>;

const logSink: Sink = (event) => {
  console.info(describe(event));
};

let sink: Sink = logSink;

/** Tests swap the sink to see what was sent; pass null to restore logging. */
export function setNotificationSink(next: Sink | null): void {
  sink = next ?? logSink;
}

/** Never throws: a failed notification must not undo a placed order. */
export async function notify(event: NotificationEvent): Promise<void> {
  try {
    await sink(event);
  } catch (error) {
    console.error("[notify] failed", event.type, error instanceof Error ? error.name : "unknown");
  }
}
