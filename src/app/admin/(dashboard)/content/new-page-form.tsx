"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IDLE } from "@/modules/access/action-state";
import { createPageAction } from "@/modules/content/content.actions";

export function NewPageForm() {
  const [state, action, pending] = useActionState(createPageAction, IDLE);
  return (
    <form
      action={action}
      className="mt-3 grid gap-3 sm:grid-cols-[12rem_1fr_1fr_auto] sm:items-end"
    >
      <div>
        <label htmlFor="slug" className="mb-1 block text-xs text-muted-foreground">
          Address (English, e.g. eid-offer)
        </label>
        <Input
          id="slug"
          name="slug"
          required
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          maxLength={60}
          data-testid="new-page-slug"
        />
      </div>
      <div>
        <label htmlFor="titleEn" className="mb-1 block text-xs text-muted-foreground">
          Title (English)
        </label>
        <Input id="titleEn" name="titleEn" required maxLength={120} data-testid="new-page-title" />
      </div>
      <div>
        <label htmlFor="titleBn" className="mb-1 block text-xs text-muted-foreground">
          শিরোনাম (বাংলা)
        </label>
        <Input id="titleBn" name="titleBn" lang="bn" maxLength={120} />
      </div>
      <Button type="submit" disabled={pending} data-testid="create-page">
        Create page
      </Button>
      {state.status === "error" ? (
        <p role="alert" className="text-sm text-destructive sm:col-span-4">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
