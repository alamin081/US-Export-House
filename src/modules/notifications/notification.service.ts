import "server-only";

/**
 * Outgoing notifications. Phase 8 only records that an event happened (no
 * SMS, no email yet); a later phase plugs a real sender in here. Events carry
 * no personal data: never a phone number, name or address.
 */

export type NotificationEvent = { type: "order.placed"; orderNumber: string; totalPoisha: number };

type Sink = (event: NotificationEvent) => void | Promise<void>;

const logSink: Sink = (event) => {
  console.info(`[notify] ${event.type} ${event.orderNumber} total=${event.totalPoisha}`);
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
