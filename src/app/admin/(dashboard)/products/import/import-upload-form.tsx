"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileCheck2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { checkImportAction } from "@/modules/catalog/import/product-import.actions";

/** Step 1: choose the file and check it. Nothing is saved to the catalogue yet. */
export function ImportUploadForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const check = () =>
    start(async () => {
      if (file === null) return;
      setMessage(null);
      const data = new FormData();
      data.set("file", file);
      const result = await checkImportAction(data);
      if (result.status === "error") {
        setMessage(result.message);
        return;
      }
      router.push(`/admin/products/import/${result.data.id}`);
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <Label htmlFor="product-import-file" required>
            CSV or Excel (.xlsx) file
          </Label>
          <input
            id="product-import-file"
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            data-testid="product-import-file"
            className="block w-full text-sm file:me-3 file:rounded-md file:border file:border-input file:bg-secondary file:px-3 file:py-2 file:text-sm"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setMessage(null);
            }}
          />
        </div>
        <Button
          type="button"
          disabled={pending || file === null}
          onClick={check}
          data-testid="product-import-check"
        >
          {pending ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : (
            <FileCheck2 aria-hidden="true" />
          )}
          Check file
        </Button>
      </div>
      <p className="text-xs text-muted-foreground" lang="bn">
        যাচাইয়ে প্রোডাক্টে কিছুই লেখা হয় না — আগে প্রিভিউ দেখবেন, তারপর আমদানি।
      </p>
      {message === null ? null : (
        <p role="alert" className="text-sm text-destructive" data-testid="product-import-message">
          {message}
        </p>
      )}
    </div>
  );
}
