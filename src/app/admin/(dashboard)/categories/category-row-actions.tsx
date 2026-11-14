"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { deleteCategoryAction, moveCategoryAction } from "@/modules/catalog/catalog.actions";

export function CategoryRowActions({
  categoryId,
  name,
  canMoveUp,
  canMoveDown,
  canDelete,
  rowIndex,
}: {
  categoryId: string;
  name: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  canDelete: boolean;
  rowIndex: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (action: () => Promise<{ status: "success" | "error"; message: string }>) =>
    startTransition(async () => {
      const result = await action();
      setError(result.status === "error" ? result.message : null);
      router.refresh();
    });

  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="iconSm"
        aria-label={`Move ${name} up`}
        disabled={!canMoveUp || pending}
        data-testid={`move-up-${rowIndex}`}
        onClick={() => run(() => moveCategoryAction({ categoryId, direction: "up" }))}
      >
        <ArrowUp aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="iconSm"
        aria-label={`Move ${name} down`}
        disabled={!canMoveDown || pending}
        onClick={() => run(() => moveCategoryAction({ categoryId, direction: "down" }))}
      >
        <ArrowDown aria-hidden="true" />
      </Button>
      {canDelete ? (
        <Button
          type="button"
          variant="ghost"
          size="iconSm"
          aria-label={`Delete ${name}`}
          disabled={pending}
          onClick={() => {
            if (window.confirm(`Delete the category "${name}"?`))
              run(() => deleteCategoryAction(categoryId));
          }}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      ) : null}
      {error === null ? null : (
        <span role="alert" className="ml-2 text-xs text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}
