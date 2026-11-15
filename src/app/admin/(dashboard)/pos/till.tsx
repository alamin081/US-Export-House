"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Minus, PauseCircle, Plus, ScanLine, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatMoney, parseTakaInput } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  findBillAction,
  holdBillAction,
  listHeldBillsAction,
  openDayAction,
  resumeHeldBillAction,
  sellAction,
} from "@/modules/pos/pos.actions";
import { priceTill, type DiscountInput } from "@/modules/pos/pos-rules";

interface TillContext {
  canManageDay: boolean;
  receiptWidthMm: number;
  discountLimitPercent: number | null;
  locations: ReadonlyArray<{
    id: string;
    code: string;
    nameEn: string;
    counters: ReadonlyArray<{ code: string; session: { id: string; reference: string } | null }>;
  }>;
}

interface Line {
  variantId: string;
  sku: string;
  name: string;
  pricePoisha: number;
  available: number;
  quantity: number;
  discountKind: "PERCENT" | "AMOUNT";
  discountValue: string;
}

interface PaymentRow {
  method: "CASH" | "CARD" | "BKASH" | "NAGAD";
  amount: string;
  tendered: string;
  reference: string;
}

const METHOD_LABELS: Record<PaymentRow["method"], string> = {
  CASH: "Cash",
  CARD: "Card",
  BKASH: "bKash",
  NAGAD: "Nagad",
};

const field = "h-10 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground";
const small = "h-9 rounded-md border border-input bg-card px-2 text-sm text-foreground";

function newKey(): string {
  return `${Date.now().toString(36)}-${crypto.randomUUID()}`;
}

function discountOf(kind: "PERCENT" | "AMOUNT", value: string): DiscountInput {
  if (value.trim() === "") return null;
  if (kind === "PERCENT") {
    const percent = Number(value);
    return Number.isFinite(percent) ? { kind, value: percent } : null;
  }
  const poisha = parseTakaInput(value);
  return poisha === null ? null : { kind, value: poisha };
}

function taka(poisha: number): string {
  return String(poisha / 100);
}

/**
 * The till screen. Totals here are a preview; the server re-reads prices and
 * rebuilds every number when the sale is completed. Without a connection the
 * sale is not completed, and retrying the same bill can never charge twice
 * (each bill carries one idempotency key).
 */
export function Till({ context }: { context: TillContext }) {
  const router = useRouter();
  const first = context.locations[0];
  const [locationId, setLocationId] = useState(first?.id ?? "");
  const location = context.locations.find((row) => row.id === locationId);
  const [counterCode, setCounterCode] = useState(location?.counters[0]?.code ?? "MAIN");
  const session = location?.counters.find((row) => row.code === counterCode)?.session ?? null;

  const [lines, setLines] = useState<Line[]>([]);
  const [billKind, setBillKind] = useState<"PERCENT" | "AMOUNT">("PERCENT");
  const [billValue, setBillValue] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [payments, setPayments] = useState<PaymentRow[]>([
    { method: "CASH", amount: "", tendered: "", reference: "" },
  ]);
  const [approval, setApproval] = useState<{ email: string; pin: string } | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(newKey);
  const [scan, setScan] = useState("");
  const [signal, setSignal] = useState<{ ok: boolean; text: string } | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [done, setDone] = useState<{ orderId: string; bill: string; change: number } | null>(null);
  const [held, setHeld] = useState<Array<{ id: string; label: string }>>([]);
  const [billSearch, setBillSearch] = useState("");
  const [pending, startTransition] = useTransition();
  const scanRef = useRef<HTMLInputElement>(null);

  const totals = useMemo(
    () =>
      priceTill({
        lines: lines.map((line) => ({
          variantId: line.variantId,
          unitPricePoisha: line.pricePoisha,
          quantity: line.quantity,
          discount: discountOf(line.discountKind, line.discountValue),
        })),
        billDiscount: discountOf(billKind, billValue),
        coupon: null,
      }),
    [lines, billKind, billValue],
  );
  const paid = payments.reduce((sum, row) => sum + (parseTakaInput(row.amount) ?? 0), 0);
  const cash = payments.find((row) => row.method === "CASH");
  const change =
    cash === undefined || cash.tendered === ""
      ? 0
      : Math.max(0, (parseTakaInput(cash.tendered) ?? 0) - (parseTakaInput(cash.amount) ?? 0));
  const overLimit =
    context.discountLimitPercent !== null &&
    totals.manualDiscountPoisha * 100 > context.discountLimitPercent * totals.subtotalPoisha;

  useEffect(() => {
    if (session === null) return;
    let active = true;
    void listHeldBillsAction(session.id).then((rows) => {
      if (active) setHeld(rows);
    });
    return () => {
      active = false;
    };
  }, [session]);

  const reset = () => {
    setLines([]);
    setBillValue("");
    setCouponCode("");
    setCustomerName("");
    setCustomerPhone("");
    setPayments([{ method: "CASH", amount: "", tendered: "", reference: "" }]);
    setApproval(null);
    setIdempotencyKey(newKey());
    setMessage(null);
  };

  const lookUp = async (code: string) => {
    if (code.trim() === "" || location === undefined) return;
    try {
      const response = await fetch(
        `/api/admin/pos/lookup?location=${encodeURIComponent(location.id)}&code=${encodeURIComponent(code.trim())}`,
      );
      const body = (await response.json()) as {
        item?: {
          variantId: string;
          sku: string;
          name: string;
          pricePoisha: number;
          available: number;
          sellable: boolean;
        };
        error?: { message?: string };
      };
      if (!response.ok || body.item === undefined || body.item === null) {
        setSignal({ ok: false, text: body.error?.message ?? `Unknown code "${code}".` });
        return;
      }
      const item = body.item;
      if (!item.sellable) {
        setSignal({ ok: false, text: `${item.sku} is not for sale.` });
        return;
      }
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
                pricePoisha: item.pricePoisha,
                available: item.available,
                quantity: 1,
                discountKind: "PERCENT",
                discountValue: "",
              },
            ],
      );
      setSignal({ ok: true, text: `${item.sku} — ${item.name}` });
      setDone(null);
    } catch {
      setSignal({ ok: false, text: "No connection. Check the network and scan again." });
    }
  };

  const setLine = (variantId: string, change: Partial<Line>) =>
    setLines((current) =>
      current
        .map((line) => (line.variantId === variantId ? { ...line, ...change } : line))
        .filter((line) => line.quantity > 0),
    );

  const complete = () =>
    startTransition(async () => {
      if (session === null) return;
      setMessage(null);
      try {
        const result = await sellAction({
          sessionId: session.id,
          idempotencyKey,
          lines: lines.map((line) => ({
            variantId: line.variantId,
            quantity: line.quantity,
            discount:
              line.discountValue === ""
                ? null
                : { kind: line.discountKind, value: line.discountValue },
          })),
          billDiscount: billValue === "" ? null : { kind: billKind, value: billValue },
          couponCode,
          customerName,
          customerPhone,
          payments,
          approval,
        });
        if (result.status === "success") {
          setDone({
            orderId: result.sale.orderId,
            bill: result.sale.billNumber,
            change: result.sale.changePoisha,
          });
          reset();
          router.refresh();
        } else {
          if (result.needsApproval === true && approval === null)
            setApproval({ email: "", pin: "" });
          setMessage({ ok: false, text: result.message });
        }
      } catch {
        setMessage({
          ok: false,
          text: "No connection — the sale was NOT completed. Check the network and press Complete again.",
        });
      }
    });

  if (context.locations.length === 0) {
    return <p className="text-sm text-muted-foreground">You have no location to sell at.</p>;
  }

  return (
    <div className="flex flex-col gap-4" data-testid="till">
      <header className="flex flex-wrap items-end gap-3">
        <h1 className="me-4 text-2xl font-semibold tracking-tight">Till</h1>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Location
          <select
            className={small}
            value={locationId}
            onChange={(event) => {
              setLocationId(event.target.value);
              setCounterCode("MAIN");
              reset();
            }}
          >
            {context.locations.map((row) => (
              <option key={row.id} value={row.id}>
                {row.code} — {row.nameEn}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Counter
          <select
            className={small}
            value={counterCode}
            onChange={(event) => setCounterCode(event.target.value)}
          >
            {location?.counters.map((row) => (
              <option key={row.code} value={row.code}>
                {row.code}
              </option>
            ))}
          </select>
        </label>
        {session === null ? null : (
          <span className="pb-2 text-sm">
            Day{" "}
            <Link
              className="underline"
              href={`/admin/pos/day/${session.id}`}
              data-testid="day-link"
            >
              {session.reference}
            </Link>
          </span>
        )}
        <form
          className="ms-auto flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              const found = await findBillAction(billSearch);
              if ("orderId" in found) router.push(`/admin/orders/${found.orderId}`);
              else setMessage({ ok: false, text: found.error });
            });
          }}
        >
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Find a bill (returns)
            <input
              className={cn(small, "w-44")}
              placeholder="Scan or type the bill no."
              value={billSearch}
              onChange={(event) => setBillSearch(event.target.value)}
            />
          </label>
          <Button type="submit" size="sm" variant="outline">
            Open
          </Button>
        </form>
      </header>

      {session === null ? (
        <OpenDay
          locationId={locationId}
          counterCode={counterCode}
          canManage={context.canManageDay}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
          <section className="flex flex-col gap-3">
            <div>
              <label
                htmlFor="till-scan"
                className="mb-1 flex items-center gap-1.5 text-sm font-medium"
              >
                <ScanLine aria-hidden="true" className="size-4" />
                Scan / SKU
              </label>
              <input
                id="till-scan"
                ref={scanRef}
                autoFocus
                autoComplete="off"
                data-testid="till-scan"
                className={cn(
                  field,
                  "text-base",
                  signal?.ok === true && "border-success bg-success/10",
                  signal?.ok === false && "border-destructive bg-destructive/10",
                )}
                placeholder="Scan a barcode or type a SKU, then Enter"
                value={scan}
                onChange={(event) => setScan(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    const code = scan;
                    setScan("");
                    void lookUp(code);
                  }
                }}
              />
              <p
                role={signal?.ok === false ? "alert" : "status"}
                data-testid="till-signal"
                className={cn(
                  "mt-1 min-h-5 text-xs",
                  signal?.ok === false ? "text-destructive" : "text-success",
                )}
              >
                {signal?.text ?? ""}
              </p>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border bg-background">
              <table className="w-full min-w-[40rem] text-sm" data-testid="till-lines">
                <thead className="bg-secondary/60 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Item</th>
                    <th className="px-3 py-2 text-right font-medium">Price</th>
                    <th className="px-3 py-2 text-center font-medium">Qty</th>
                    <th className="px-3 py-2 font-medium">Discount</th>
                    <th className="px-3 py-2 text-right font-medium">Line</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-10 text-center text-muted-foreground">
                        Scan the first item.
                      </td>
                    </tr>
                  ) : (
                    lines.map((line) => {
                      const priced = totals.lines.find((row) => row.variantId === line.variantId);
                      return (
                        <tr
                          key={line.variantId}
                          className="border-t border-border"
                          data-testid="till-line"
                        >
                          <td className="px-3 py-2">
                            {line.name}
                            <span
                              className={cn(
                                "block text-xs",
                                line.quantity > line.available
                                  ? "text-destructive"
                                  : "text-muted-foreground",
                              )}
                            >
                              {line.sku} · {line.available} here
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatMoney(line.pricePoisha, "en")}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                type="button"
                                size="iconSm"
                                variant="outline"
                                aria-label={`One less ${line.sku}`}
                                onClick={() =>
                                  setLine(line.variantId, { quantity: line.quantity - 1 })
                                }
                              >
                                <Minus aria-hidden="true" />
                              </Button>
                              <span className="w-8 text-center tabular-nums">{line.quantity}</span>
                              <Button
                                type="button"
                                size="iconSm"
                                variant="outline"
                                aria-label={`One more ${line.sku}`}
                                onClick={() =>
                                  setLine(line.variantId, { quantity: line.quantity + 1 })
                                }
                              >
                                <Plus aria-hidden="true" />
                              </Button>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex gap-1">
                              <select
                                aria-label={`Discount type for ${line.sku}`}
                                className={small}
                                value={line.discountKind}
                                onChange={(event) =>
                                  setLine(line.variantId, {
                                    discountKind: event.target.value as Line["discountKind"],
                                  })
                                }
                              >
                                <option value="PERCENT">%</option>
                                <option value="AMOUNT">৳</option>
                              </select>
                              <input
                                aria-label={`Discount for ${line.sku}`}
                                className={cn(small, "w-20")}
                                inputMode="decimal"
                                value={line.discountValue}
                                onChange={(event) =>
                                  setLine(line.variantId, { discountValue: event.target.value })
                                }
                              />
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatMoney(
                              (priced?.lineTotalPoisha ?? 0) - (priced?.manualDiscountPoisha ?? 0),
                              "en",
                            )}
                            <button
                              type="button"
                              className="ms-2 align-middle text-muted-foreground hover:text-destructive"
                              aria-label={`Remove ${line.sku}`}
                              onClick={() => setLine(line.variantId, { quantity: 0 })}
                            >
                              <Trash2 aria-hidden="true" className="inline size-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={lines.length === 0 || pending}
                onClick={() =>
                  startTransition(async () => {
                    const label = customerName || `Bill ${new Date().toLocaleTimeString("en-GB")}`;
                    const result = await holdBillAction({
                      sessionId: session.id,
                      label,
                      cart: { lines, billKind, billValue, couponCode, customerName, customerPhone },
                    });
                    if (result.status === "success") {
                      reset();
                      setHeld(await listHeldBillsAction(session.id));
                    } else if (result.status === "error")
                      setMessage({ ok: false, text: result.message });
                  })
                }
                data-testid="hold-bill"
              >
                <PauseCircle aria-hidden="true" />
                Hold bill
              </Button>
              {held.map((bill) => (
                <Button
                  key={bill.id}
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={lines.length > 0}
                  onClick={() =>
                    startTransition(async () => {
                      const cart = (await resumeHeldBillAction(session.id, bill.id)) as {
                        lines?: Line[];
                        billKind?: "PERCENT" | "AMOUNT";
                        billValue?: string;
                        couponCode?: string;
                        customerName?: string;
                        customerPhone?: string;
                      };
                      setLines(cart.lines ?? []);
                      setBillKind(cart.billKind ?? "PERCENT");
                      setBillValue(cart.billValue ?? "");
                      setCouponCode(cart.couponCode ?? "");
                      setCustomerName(cart.customerName ?? "");
                      setCustomerPhone(cart.customerPhone ?? "");
                      setHeld(await listHeldBillsAction(session.id));
                    })
                  }
                >
                  Resume: {bill.label}
                </Button>
              ))}
            </div>
          </section>

          <aside className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Customer phone (optional)
                <input
                  className={small}
                  value={customerPhone}
                  onChange={(event) => setCustomerPhone(event.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Name (optional)
                <input
                  className={small}
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Bill discount
                <span className="flex gap-1">
                  <select
                    className={small}
                    value={billKind}
                    onChange={(event) => setBillKind(event.target.value as "PERCENT" | "AMOUNT")}
                  >
                    <option value="PERCENT">%</option>
                    <option value="AMOUNT">৳</option>
                  </select>
                  <input
                    className={cn(small, "w-full")}
                    inputMode="decimal"
                    data-testid="bill-discount"
                    value={billValue}
                    onChange={(event) => setBillValue(event.target.value)}
                  />
                </span>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Coupon
                <input
                  className={small}
                  value={couponCode}
                  onChange={(event) => setCouponCode(event.target.value)}
                />
              </label>
            </div>

            <dl className="flex flex-col gap-1 border-t border-border pt-3">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="tabular-nums">{formatMoney(totals.subtotalPoisha, "en")}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Discount</dt>
                <dd className="tabular-nums">−{formatMoney(totals.manualDiscountPoisha, "en")}</dd>
              </div>
              <div className="flex justify-between text-lg font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums" data-testid="till-total">
                  {formatMoney(totals.totalPoisha, "en")}
                </dd>
              </div>
              {couponCode === "" ? null : (
                <p className="text-xs text-muted-foreground">
                  The coupon is applied when the sale completes.
                </p>
              )}
              {overLimit ? (
                <p className="text-xs text-destructive" data-testid="over-limit">
                  Above your {context.discountLimitPercent}% discount limit: a manager must approve.
                </p>
              ) : null}
            </dl>

            <div
              className="flex flex-col gap-2 border-t border-border pt-3"
              data-testid="till-payments"
            >
              {payments.map((row, index) => (
                <div key={index} className="grid grid-cols-[6rem_1fr_1fr_auto] items-end gap-1">
                  <select
                    aria-label="Payment method"
                    className={small}
                    value={row.method}
                    onChange={(event) =>
                      setPayments((current) =>
                        current.map((item, at) =>
                          at === index
                            ? { ...item, method: event.target.value as PaymentRow["method"] }
                            : item,
                        ),
                      )
                    }
                  >
                    {(Object.keys(METHOD_LABELS) as PaymentRow["method"][]).map((method) => (
                      <option key={method} value={method}>
                        {METHOD_LABELS[method]}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label={`${METHOD_LABELS[row.method]} amount`}
                    placeholder="Amount"
                    inputMode="decimal"
                    className={small}
                    value={row.amount}
                    onChange={(event) =>
                      setPayments((current) =>
                        current.map((item, at) =>
                          at === index ? { ...item, amount: event.target.value } : item,
                        ),
                      )
                    }
                  />
                  {row.method === "CASH" ? (
                    <input
                      aria-label="Cash handed over"
                      placeholder="Given"
                      inputMode="decimal"
                      className={small}
                      value={row.tendered}
                      onChange={(event) =>
                        setPayments((current) =>
                          current.map((item, at) =>
                            at === index ? { ...item, tendered: event.target.value } : item,
                          ),
                        )
                      }
                    />
                  ) : (
                    <input
                      aria-label={`${METHOD_LABELS[row.method]} reference`}
                      placeholder="Reference"
                      className={small}
                      value={row.reference}
                      onChange={(event) =>
                        setPayments((current) =>
                          current.map((item, at) =>
                            at === index ? { ...item, reference: event.target.value } : item,
                          ),
                        )
                      }
                    />
                  )}
                  <button
                    type="button"
                    className="pb-2 text-xs underline"
                    onClick={() => {
                      const others = payments.reduce(
                        (sum, item, at) =>
                          at === index ? sum : sum + (parseTakaInput(item.amount) ?? 0),
                        0,
                      );
                      const rest = Math.max(0, totals.totalPoisha - others);
                      setPayments((current) =>
                        current.map((item, at) =>
                          at === index ? { ...item, amount: taka(rest) } : item,
                        ),
                      );
                    }}
                  >
                    Rest
                  </button>
                </div>
              ))}
              <div className="flex gap-3 text-xs">
                <button
                  type="button"
                  className="underline"
                  onClick={() =>
                    setPayments((current) => [
                      ...current,
                      { method: "CARD", amount: "", tendered: "", reference: "" },
                    ])
                  }
                >
                  Split: add a payment
                </button>
                {payments.length > 1 ? (
                  <button
                    type="button"
                    className="underline"
                    onClick={() => setPayments((current) => current.slice(0, -1))}
                  >
                    Remove last
                  </button>
                ) : null}
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Paid</span>
                <span
                  className={cn("tabular-nums", paid !== totals.totalPoisha && "text-destructive")}
                >
                  {formatMoney(paid, "en")}
                </span>
              </div>
              <div className="flex justify-between text-base font-semibold">
                <span>Change</span>
                <span className="tabular-nums" data-testid="till-change">
                  {formatMoney(change, "en")}
                </span>
              </div>
            </div>

            {approval === null ? null : (
              <div
                className="grid grid-cols-2 gap-2 rounded-md border border-accent bg-accent/20 p-2"
                data-testid="approval"
              >
                <p className="col-span-2 text-xs">Manager approval for the discount</p>
                <input
                  aria-label="Manager email"
                  placeholder="Manager email"
                  className={small}
                  value={approval.email}
                  onChange={(event) => setApproval({ ...approval, email: event.target.value })}
                />
                <input
                  aria-label="Manager PIN"
                  placeholder="PIN"
                  type="password"
                  inputMode="numeric"
                  className={small}
                  value={approval.pin}
                  onChange={(event) => setApproval({ ...approval, pin: event.target.value })}
                />
              </div>
            )}

            {message === null ? null : (
              <p role="alert" className="text-sm text-destructive" data-testid="till-message">
                {message.text}
              </p>
            )}
            <Button
              type="button"
              size="lg"
              disabled={pending || lines.length === 0}
              onClick={complete}
              data-testid="complete-sale"
            >
              Complete sale
            </Button>
            <button type="button" className="text-xs underline" onClick={reset}>
              Clear the bill
            </button>

            {done === null ? null : (
              <div
                className="rounded-md border border-success bg-success/10 p-3"
                data-testid="sale-done"
              >
                <p className="font-semibold">
                  Bill <span data-testid="bill-number">{done.bill}</span> completed.
                </p>
                <p>Change to give: {formatMoney(done.change, "en")}</p>
                <a
                  className="underline"
                  href={`/admin/print/pos/receipt/${done.orderId}`}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="print-receipt"
                >
                  Print receipt
                </a>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function OpenDay({
  locationId,
  counterCode,
  canManage,
}: {
  locationId: string;
  counterCode: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [float, setFloat] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!canManage) {
    return (
      <p className="rounded-md border border-border bg-background p-4 text-sm">
        The day is not open at this counter. Ask the branch manager to open it.
      </p>
    );
  }
  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-background p-4 text-sm"
      data-testid="open-day"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await openDayAction({ locationId, counterCode, openingFloat: float });
          if (result.status === "success") router.refresh();
          else if (result.status === "error") setError(result.message);
        });
      }}
    >
      <p className="w-full">Start the day: count the cash in the drawer.</p>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Cash in the drawer (taka)
        <input
          className={cn(field, "w-48")}
          name="openingFloat"
          inputMode="decimal"
          value={float}
          onChange={(event) => setFloat(event.target.value)}
        />
      </label>
      <Button type="submit" disabled={pending}>
        Open the day
      </Button>
      {error === null ? null : (
        <p role="alert" className="w-full text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
