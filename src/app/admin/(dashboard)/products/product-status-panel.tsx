"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { changeProductStatusAction, deleteProductAction } from "@/modules/catalog/catalog.actions";

type Status = "DRAFT" | "PUBLISHED" | "ARCHIVED";

const STATUS_BADGE: Record<Status, "muted" | "success" | "outline"> = {
  DRAFT: "muted",
  PUBLISHED: "success",
  ARCHIVED: "outline",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <Badge variant={STATUS_BADGE[status]} data-testid="product-status">
      {status.toLowerCase()}
    </Badge>
  );
}

/** Publish / unpublish / archive / delete, each re-checked on the server. */
export function ProductStatusPanel({
  productId,
  status,
  canPublish,
  canDelete,
  storefrontPath,
}: {
  productId: string;
  status: Status;
  canPublish: boolean;
  canDelete: boolean;
  storefrontPath: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reasons, setReasons] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const change = (next: Status) =>
    startTransition(async () => {
      const result = await changeProductStatusAction({ productIds: [productId], status: next });
      if (result.status === "error") {
        setMessage(result.message);
        setReasons([]);
        return;
      }
      const outcome = result.data[0];
      if (outcome !== undefined && !outcome.ok) {
        setMessage("Not published yet:");
        setReasons(outcome.reasons);
        return;
      }
      setMessage(null);
      setReasons([]);
      router.refresh();
    });

  const remove = () => {
    if (!window.confirm("Delete this draft? It has never been on an order, so it can be removed."))
      return;
    startTransition(async () => {
      const result = await deleteProductAction(productId);
      if (result.status === "error") {
        setMessage(result.message);
        return;
      }
      router.replace("/admin/products");
    });
  };

  return (
    <div className="rounded-lg border border-border bg-background p-4" data-testid="status-panel">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
          Status
        </h2>
        <StatusBadge status={status} />
      </div>
      {status === "PUBLISHED" ? (
        <a
          href={storefrontPath}
          target="_blank"
          rel="noreferrer"
          className="mt-2 block text-xs underline"
        >
          View on the storefront
        </a>
      ) : null}

      {canPublish ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {status !== "PUBLISHED" ? (
            <Button
              size="sm"
              onClick={() => change("PUBLISHED")}
              disabled={pending}
              data-testid="publish"
            >
              Publish
            </Button>
          ) : null}
          {status === "PUBLISHED" ? (
            <Button size="sm" variant="outline" onClick={() => change("DRAFT")} disabled={pending}>
              Back to draft
            </Button>
          ) : null}
          {status !== "ARCHIVED" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => change("ARCHIVED")}
              disabled={pending}
              data-testid="archive"
            >
              Archive
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => change("DRAFT")} disabled={pending}>
              Restore to draft
            </Button>
          )}
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          You cannot publish or archive products.
        </p>
      )}
      {canDelete && status === "DRAFT" ? (
        <Button
          size="sm"
          variant="ghost"
          className="mt-2 text-destructive"
          onClick={remove}
          disabled={pending}
        >
          Delete draft
        </Button>
      ) : null}

      {message === null ? null : (
        <div role="alert" className="mt-3 text-xs text-destructive" data-testid="status-message">
          <p>{message}</p>
          {reasons.length === 0 ? null : (
            <ul className="mt-1 list-disc pl-4">
              {reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
