"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { saveTagAction } from "@/modules/catalog/catalog.actions";
import { slugify } from "@/modules/catalog/slug";
import { ErrorSummary, TextAreaField, TextField } from "../catalogue/fields";

export interface TagInitial {
  id: string;
  slug: string;
  nameEn: string;
  nameBn: string | null;
  aliases: string[];
}

/** A tag with its alternative spellings (Banglish, misspellings) for search. */
export function TagEditor({ initial }: { initial: TagInitial | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState({
    slug: initial?.slug ?? "",
    nameEn: initial?.nameEn ?? "",
    nameBn: initial?.nameBn ?? "",
    aliases: (initial?.aliases ?? []).join(", "),
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  const save = () =>
    startTransition(async () => {
      const result = await saveTagAction({
        ...(initial === null ? {} : { id: initial.id }),
        ...state,
      });
      if (result.status === "error") {
        setFieldErrors(result.fieldErrors);
        setMessage(result.message);
        return;
      }
      setFieldErrors({});
      setMessage(null);
      router.push("/admin/tags");
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-background p-4">
      <h2 className="text-sm font-semibold">
        {initial === null ? "Add a tag" : `Edit ${initial.nameEn}`}
      </h2>
      <ErrorSummary message={message} fieldErrors={fieldErrors} />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          label="Name (English)"
          required
          value={state.nameEn}
          error={fieldErrors.nameEn}
          onChange={(value) =>
            setState((current) => ({
              ...current,
              nameEn: value,
              ...(initial === null && current.slug === slugify(current.nameEn)
                ? { slug: slugify(value) }
                : {}),
            }))
          }
        />
        <TextField
          label="Name (Bengali)"
          lang="bn"
          value={state.nameBn}
          onChange={(value) => setState((current) => ({ ...current, nameBn: value }))}
        />
        <TextField
          label="Slug"
          required
          value={state.slug}
          error={fieldErrors.slug}
          onChange={(value) => setState((current) => ({ ...current, slug: value }))}
        />
        <TextAreaField
          className="sm:col-span-3"
          label="Other spellings"
          hint="Comma-separated, e.g. panjabi, punjabi, panjabee. Search matches any of them."
          value={state.aliases}
          error={fieldErrors.aliases}
          rows={2}
          onChange={(value) => setState((current) => ({ ...current, aliases: value }))}
        />
      </div>
      <div>
        <Button type="button" size="sm" onClick={save} disabled={pending}>
          {pending ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : (
            <Save aria-hidden="true" />
          )}
          Save tag
        </Button>
      </div>
    </div>
  );
}
