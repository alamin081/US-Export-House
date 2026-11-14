"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { startCountAction } from "@/modules/inventory/inventory.actions";

/** Starts a count: the expected quantities are snapshotted at that moment. */
export function StartCountForm({
  locations,
  categories,
}: {
  locations: ReadonlyArray<{ id: string; label: string }>;
  categories: ReadonlyArray<{ id: string; label: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="grid gap-4 rounded-lg border border-border bg-background p-5 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await startCountAction({ locationId, categoryId, note });
          if (result.status === "error") {
            setError(result.message);
            return;
          }
          router.push(`/admin/stock-counts/${result.data.id}`);
        });
      }}
    >
      <div>
        <Label htmlFor="count-location" required>
          Location
        </Label>
        <Select
          id="count-location"
          value={locationId}
          onChange={(event) => setLocationId(event.target.value)}
        >
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="count-category">Category (optional)</Label>
        <Select
          id="count-category"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
        >
          <option value="">Whole location</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="count-note">Note</Label>
        <Input id="count-note" value={note} onChange={(event) => setNote(event.target.value)} />
      </div>
      <Button type="submit" disabled={pending || locationId === ""}>
        {pending ? (
          <Loader2 aria-hidden="true" className="animate-spin" />
        ) : (
          <ClipboardCheck aria-hidden="true" />
        )}
        Start count
      </Button>
      {error === null ? null : (
        <p role="alert" className="text-sm text-destructive sm:col-span-4">
          {error}
        </p>
      )}
    </form>
  );
}
