"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/money";
import { ScanInput, type ScannedItem } from "@/modules/inventory/components/scan-input";
import { correctAddressAction, editOrderAction } from "@/modules/orders/orders.actions";

interface Line {
  variantId: string;
  sku: string;
  name: string;
  quantity: number;
  /** Null for a line added now (today's price applies). */
  unitPricePoisha: number | null;
}

interface Option {
  id: string;
  name: string;
}

const field =
  "h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground disabled:opacity-60";
const label = "flex flex-col gap-1 text-xs text-muted-foreground";

export function EditOrderForm({
  mode,
  order,
  divisions,
  districts: initialDistricts,
  upazilas: initialUpazilas,
}: {
  mode: "edit" | "correct";
  order: {
    id: string;
    version: number;
    customerName: string;
    street: string;
    landmark: string;
    deliveryNote: string;
    area: { divisionId: string; districtId: string; upazilaId: string };
    lines: ReadonlyArray<Omit<Line, "unitPricePoisha"> & { unitPricePoisha: number }>;
  };
  divisions: readonly Option[];
  districts: readonly Option[];
  upazilas: readonly Option[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [lines, setLines] = useState<Line[]>(order.lines.map((line) => ({ ...line })));
  const [customerName, setCustomerName] = useState(order.customerName);
  const [street, setStreet] = useState(order.street);
  const [landmark, setLandmark] = useState(order.landmark);
  const [deliveryNote, setDeliveryNote] = useState(order.deliveryNote);
  const [reason, setReason] = useState("");
  const [area, setArea] = useState(order.area);
  const [districts, setDistricts] = useState<readonly Option[]>(initialDistricts);
  const [upazilas, setUpazilas] = useState<readonly Option[]>(initialUpazilas);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saved, setSaved] = useState(false);

  const changeDivision = async (divisionId: string) => {
    setArea({ divisionId, districtId: "", upazilaId: "" });
    setDistricts([]);
    setUpazilas([]);
    if (divisionId === "") return;
    const response = await fetch(`/api/geo/districts?division=${encodeURIComponent(divisionId)}`);
    if (response.ok) {
      const body = (await response.json()) as { districts: Array<{ id: string; nameEn: string }> };
      setDistricts(body.districts.map((row) => ({ id: row.id, name: row.nameEn })));
    }
  };
  const changeDistrict = async (districtId: string) => {
    setArea((current) => ({ ...current, districtId, upazilaId: "" }));
    setUpazilas([]);
    if (districtId === "") return;
    const response = await fetch(`/api/geo/upazilas?district=${encodeURIComponent(districtId)}`);
    if (response.ok) {
      const body = (await response.json()) as { upazilas: Array<{ id: string; nameEn: string }> };
      setUpazilas(body.upazilas.map((row) => ({ id: row.id, name: row.nameEn })));
    }
  };

  const addItem = (item: ScannedItem) => {
    if (!item.isActive) throw new Error(`${item.sku} is not for sale.`);
    setLines((current) =>
      current.some((line) => line.variantId === item.variantId)
        ? current.map((line) =>
            line.variantId === item.variantId ? { ...line, quantity: line.quantity + 1 } : line,
          )
        : [
            ...current,
            {
              variantId: item.variantId,
              sku: item.sku,
              name: item.name,
              quantity: 1,
              unitPricePoisha: null,
            },
          ],
    );
  };
  const setQuantity = (variantId: string, quantity: number) =>
    setLines((current) =>
      current.map((line) =>
        line.variantId === variantId
          ? { ...line, quantity: Math.max(0, Math.min(100, quantity)) }
          : line,
      ),
    );

  const submit = () =>
    startTransition(async () => {
      const address = { customerName, area, street, landmark, deliveryNote };
      const result =
        mode === "edit"
          ? await editOrderAction(order.id, {
              version: order.version,
              ...address,
              lines: lines.map((line) => ({ variantId: line.variantId, quantity: line.quantity })),
            })
          : await correctAddressAction(order.id, { version: order.version, ...address, reason });
      if (result.status === "success") {
        // A changed total must be told to the customer: stay and show it.
        const remind = "remindCustomer" in result && result.remindCustomer === true;
        const removed = "couponRemoved" in result && result.couponRemoved === true;
        if (remind || removed) {
          setMessage({
            ok: true,
            text: `${result.message}${removed ? " The coupon no longer applied and was removed." : ""}`,
          });
          setSaved(true);
        } else {
          router.push(`/admin/orders/${order.id}`);
        }
        router.refresh();
      } else if (result.status === "error") {
        setMessage({ ok: false, text: result.message });
      }
    });

  return (
    <form
      className="mt-6 flex flex-col gap-6"
      data-testid="edit-order-form"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {mode === "edit" ? (
        <section className="rounded-lg border border-border bg-background p-4">
          <h2 className="text-sm font-semibold">Items</h2>
          <table className="mt-3 w-full text-sm">
            <tbody>
              {lines.map((line) => (
                <tr key={line.variantId} className="border-t border-border" data-testid="edit-line">
                  <td className="py-2">
                    {line.name}
                    <span className="block text-xs text-muted-foreground">
                      {line.sku} ·{" "}
                      {line.unitPricePoisha === null
                        ? "new line — today's price"
                        : `${formatMoney(line.unitPricePoisha, "en")} (kept)`}
                    </span>
                  </td>
                  <td className="w-44 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        size="iconSm"
                        variant="outline"
                        aria-label={`One less ${line.sku}`}
                        onClick={() => setQuantity(line.variantId, line.quantity - 1)}
                      >
                        <Minus aria-hidden="true" />
                      </Button>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        aria-label={`Quantity of ${line.sku}`}
                        className="h-9 w-14 rounded-md border border-input bg-card px-2 text-center"
                        value={line.quantity}
                        onChange={(event) =>
                          setQuantity(line.variantId, Number(event.target.value) || 0)
                        }
                      />
                      <Button
                        type="button"
                        size="iconSm"
                        variant="outline"
                        aria-label={`One more ${line.sku}`}
                        onClick={() => setQuantity(line.variantId, line.quantity + 1)}
                      >
                        <Plus aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        size="iconSm"
                        variant="ghost"
                        aria-label={`Remove ${line.sku}`}
                        onClick={() => setQuantity(line.variantId, 0)}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">
            A line set to 0 is removed. To change a size or colour, remove it and add the other
            variant.
          </p>
          <div className="mt-4 max-w-md">
            <ScanInput label="Add an item (scan, SKU or name)" autoFocus={false} onItem={addItem} />
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 rounded-lg border border-border bg-background p-4 sm:grid-cols-2">
        <h2 className="text-sm font-semibold sm:col-span-2">Customer and address</h2>
        <label className={label}>
          Name
          <input
            className={field}
            name="customerName"
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
          />
        </label>
        <label className={label}>
          Division
          <select
            className={field}
            value={area.divisionId}
            onChange={(event) => void changeDivision(event.target.value)}
          >
            <option value="">Choose…</option>
            {divisions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          District
          <select
            className={field}
            value={area.districtId}
            disabled={districts.length === 0}
            onChange={(event) => void changeDistrict(event.target.value)}
          >
            <option value="">Choose…</option>
            {districts.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Upazila / thana
          <select
            className={field}
            value={area.upazilaId}
            disabled={upazilas.length === 0}
            onChange={(event) =>
              setArea((current) => ({ ...current, upazilaId: event.target.value }))
            }
          >
            <option value="">Choose…</option>
            {upazilas.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
        <label className={`${label} sm:col-span-2`}>
          Street address
          <input
            className={field}
            name="street"
            value={street}
            onChange={(event) => setStreet(event.target.value)}
          />
        </label>
        <label className={label}>
          Landmark
          <input
            className={field}
            value={landmark}
            onChange={(event) => setLandmark(event.target.value)}
          />
        </label>
        <label className={label}>
          Delivery note
          <input
            className={field}
            value={deliveryNote}
            onChange={(event) => setDeliveryNote(event.target.value)}
          />
        </label>
        {mode === "correct" ? (
          <label className={`${label} sm:col-span-2`}>
            Why the address changed (kept with the invoice version)
            <input
              className={field}
              name="reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
        ) : null}
      </section>

      {message === null ? null : (
        <p
          role={message.ok ? "status" : "alert"}
          data-testid="edit-message"
          className={message.ok ? "text-sm text-success" : "text-sm text-destructive"}
        >
          {message.text}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending || saved} data-testid="save-order">
          {mode === "edit" ? "Save changes" : "Save address"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push(`/admin/orders/${order.id}`)}
        >
          Back
        </Button>
      </div>
    </form>
  );
}
