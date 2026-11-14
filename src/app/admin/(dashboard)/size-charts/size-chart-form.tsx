"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Save, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { deleteSizeChartAction, saveSizeChartAction } from "@/modules/catalog/catalog.actions";
import { ErrorSummary, TextAreaField, TextField } from "../catalogue/fields";
import { useUnsavedChangesWarning } from "../catalogue/use-unsaved-changes";

export interface SizeChartInitial {
  id: string;
  nameEn: string;
  nameBn: string | null;
  noteEn: string | null;
  noteBn: string | null;
  unit: "INCH" | "CM";
  columns: Array<{ en: string; bn: string }>;
  rows: Array<{ size: string; values: string[] }>;
  usage: number;
}

/** Size chart editor: sizes down the side, measurements across. */
export function SizeChartForm({
  initial,
  canDelete,
}: {
  initial: SizeChartInitial | null;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [baseline] = useState(() => ({
    nameEn: initial?.nameEn ?? "",
    nameBn: initial?.nameBn ?? "",
    noteEn: initial?.noteEn ?? "",
    noteBn: initial?.noteBn ?? "",
    unit: initial?.unit ?? ("INCH" as "INCH" | "CM"),
    columns: initial?.columns ?? [
      { en: "Chest", bn: "বুক" },
      { en: "Length", bn: "লম্বা" },
    ],
    rows: initial?.rows ?? [{ size: "M", values: ["", ""] }],
  }));
  const [state, setState] = useState(baseline);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const dirty = useMemo(
    () => JSON.stringify(state) !== JSON.stringify(baseline),
    [state, baseline],
  );
  useUnsavedChangesWarning(dirty && !pending);

  const setCell = (rowIndex: number, columnIndex: number, value: string) =>
    setState((current) => ({
      ...current,
      rows: current.rows.map((row, index) =>
        index === rowIndex
          ? {
              ...row,
              values: row.values.map((cell, cellIndex) =>
                cellIndex === columnIndex ? value : cell,
              ),
            }
          : row,
      ),
    }));

  const addColumn = () =>
    setState((current) => ({
      ...current,
      columns: [...current.columns, { en: "", bn: "" }],
      rows: current.rows.map((row) => ({ ...row, values: [...row.values, ""] })),
    }));

  const removeColumn = (columnIndex: number) =>
    setState((current) => ({
      ...current,
      columns: current.columns.filter((_, index) => index !== columnIndex),
      rows: current.rows.map((row) => ({
        ...row,
        values: row.values.filter((_, index) => index !== columnIndex),
      })),
    }));

  const save = () =>
    startTransition(async () => {
      const result = await saveSizeChartAction({
        ...(initial === null ? {} : { id: initial.id }),
        ...state,
      });
      if (result.status === "error") {
        setFieldErrors(result.fieldErrors);
        setMessage(result.message);
        return;
      }
      router.push("/admin/size-charts");
      router.refresh();
    });

  const remove = () => {
    if (initial === null || !window.confirm(`Delete "${initial.nameEn}"?`)) return;
    startTransition(async () => {
      const result = await deleteSizeChartAction(initial.id);
      if (result.status === "error") {
        setMessage(result.message);
        return;
      }
      router.push("/admin/size-charts");
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <ErrorSummary message={message} fieldErrors={fieldErrors} />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="Name (English)"
          required
          value={state.nameEn}
          error={fieldErrors.nameEn}
          onChange={(value) => setState((current) => ({ ...current, nameEn: value }))}
        />
        <TextField
          label="Name (Bengali)"
          lang="bn"
          value={state.nameBn}
          onChange={(value) => setState((current) => ({ ...current, nameBn: value }))}
        />
        <TextAreaField
          label="Note (English)"
          value={state.noteEn}
          rows={2}
          onChange={(value) => setState((current) => ({ ...current, noteEn: value }))}
        />
        <TextAreaField
          label="Note (Bengali)"
          lang="bn"
          value={state.noteBn}
          rows={2}
          onChange={(value) => setState((current) => ({ ...current, noteBn: value }))}
        />
        <div>
          <Label htmlFor="unit">Unit</Label>
          <Select
            id="unit"
            value={state.unit}
            onChange={(event) =>
              setState((current) => ({ ...current, unit: event.target.value as "INCH" | "CM" }))
            }
          >
            <option value="INCH">Inches</option>
            <option value="CM">Centimetres</option>
          </Select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="text-sm">
          <thead className="bg-secondary/60">
            <tr>
              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">
                Size
              </th>
              {state.columns.map((column, columnIndex) => (
                <th key={columnIndex} className="px-2 py-2">
                  <div className="flex flex-col gap-1">
                    <Input
                      aria-label={`Column ${columnIndex + 1} (English)`}
                      value={column.en}
                      placeholder="Chest"
                      className="h-8 w-28 text-xs"
                      onChange={(event) =>
                        setState((current) => ({
                          ...current,
                          columns: current.columns.map((candidate, index) =>
                            index === columnIndex
                              ? { ...candidate, en: event.target.value }
                              : candidate,
                          ),
                        }))
                      }
                    />
                    <Input
                      aria-label={`Column ${columnIndex + 1} (Bengali)`}
                      lang="bn"
                      value={column.bn}
                      placeholder="বুক"
                      className="h-8 w-28 text-xs"
                      onChange={(event) =>
                        setState((current) => ({
                          ...current,
                          columns: current.columns.map((candidate, index) =>
                            index === columnIndex
                              ? { ...candidate, bn: event.target.value }
                              : candidate,
                          ),
                        }))
                      }
                    />
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => removeColumn(columnIndex)}
                      disabled={state.columns.length === 1}
                    >
                      <X aria-hidden="true" className="inline size-3" /> remove
                    </button>
                  </div>
                </th>
              ))}
              <th className="px-2 py-2">
                <Button type="button" size="sm" variant="ghost" onClick={addColumn}>
                  <Plus aria-hidden="true" />
                  Column
                </Button>
              </th>
            </tr>
          </thead>
          <tbody>
            {state.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-t border-border">
                <td className="px-2 py-1.5">
                  <Input
                    aria-label={`Size, row ${rowIndex + 1}`}
                    value={row.size}
                    className="h-8 w-20"
                    onChange={(event) =>
                      setState((current) => ({
                        ...current,
                        rows: current.rows.map((candidate, index) =>
                          index === rowIndex
                            ? { ...candidate, size: event.target.value }
                            : candidate,
                        ),
                      }))
                    }
                  />
                </td>
                {row.values.map((value, columnIndex) => (
                  <td key={columnIndex} className="px-2 py-1.5">
                    <Input
                      aria-label={`Row ${rowIndex + 1}, column ${columnIndex + 1}`}
                      value={value}
                      className="h-8 w-28 tabular-nums"
                      onChange={(event) => setCell(rowIndex, columnIndex, event.target.value)}
                    />
                  </td>
                ))}
                <td className="px-2 py-1.5">
                  <Button
                    type="button"
                    size="iconSm"
                    variant="ghost"
                    aria-label={`Remove row ${rowIndex + 1}`}
                    disabled={state.rows.length === 1}
                    onClick={() =>
                      setState((current) => ({
                        ...current,
                        rows: current.rows.filter((_, index) => index !== rowIndex),
                      }))
                    }
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            setState((current) => ({
              ...current,
              rows: [...current.rows, { size: "", values: current.columns.map(() => "") }],
            }))
          }
        >
          <Plus aria-hidden="true" />
          Add size
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={pending}>
          {pending ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : (
            <Save aria-hidden="true" />
          )}
          Save size chart
        </Button>
        {initial !== null && canDelete ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-destructive"
            disabled={pending || initial.usage > 0}
            onClick={remove}
            title={initial.usage > 0 ? "In use by products or categories." : undefined}
          >
            <Trash2 aria-hidden="true" />
            Delete
          </Button>
        ) : null}
      </div>
    </div>
  );
}
