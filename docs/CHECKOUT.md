# Cart and checkout (Phase 8)

Guest checkout with cash on delivery. No customer accounts, OTP, SMS, email or
online payment yet.

## Cart

- A random token in the `ueh_cart` cookie (HTTP-only, SameSite=Lax, Secure on
  HTTPS), HMAC-signed with a key derived from `AUTH_SECRET`. The database keeps
  only its SHA-256 (`Cart.sessionToken`).
- The cart stores variant ids and quantities (plus the price last shown, only
  to say "the price changed"). Every view re-reads prices and the stock of the
  **default online location** (`isDefaultOnlineFulfillment`).
- Line problems block checkout: unavailable (archived / deleted), out of
  stock, more than in stock (offers the available quantity), over the per-item
  limit. More than `checkout.maxItemsPerOrder` units blocks too.
- Expiry: `cart.ttlDays` (30), sliding. `GET /api/cron/cart-cleanup` with
  `Authorization: Bearer <CRON_SECRET>` deletes expired guest carts.
- The header count comes from `GET /api/cart/summary` (no-store), so cached
  pages never depend on a visitor's cart.

## Money

All amounts are integer poisha and rebuilt on the server (`checkout/pricing.ts`):

```
subtotal      = Σ price × quantity
discount      ≤ eligible subtotal (coupon lines only; sale items only if
                checkout.couponOnSaleItems)
shipping      = 0 if a free-delivery coupon applies or
                subtotal − discount ≥ the zone's threshold (else the shop's
                shipping.freeThresholdPoisha); otherwise the zone rate
total         = subtotal − discount + shipping
```

The discount is split over eligible lines by largest remainder and stored on
each `OrderItem.discountPoisha`. Prices include VAT.

## Zones

The customer picks division → district → upazila / thana; the zone follows:
upazila mapping → district mapping → the fallback zone. See
[ADDRESS_DATA.md](ADDRESS_DATA.md) for the default mapping.

## Placing an order

The checkout page issues a signed form time and an idempotency key; each
quote returns a hash of the lines, totals, zone and coupon. On submit, in one
transaction (`runInventoryTransaction`):

1. advisory lock on the phone; an order with the same idempotency key is
   returned as it is
2. blocked phone → refused (generic message)
3. open orders for the phone in 24 h ≥ `checkout.maxOpenOrdersPerPhone`, or
   orders from the IP in the last hour ≥ `checkout.maxOrdersPerIpPerHour`
4. same phone and items within `checkout.duplicateWindowMinutes` → the earlier
   order number is shown
5. prices re-read; coupon row locked (`FOR UPDATE`) and re-evaluated (per-phone
   use excludes cancelled orders)
6. the quote hash must match what the customer saw; COD total ≤
   `checkout.codMaxTotalPoisha`
7. coupon use taken with a conditional `usedCount` update
8. order number `UEH-YYMM-NNNNN` (Bangladesh month, `order_number_seq`), order,
   items with snapshots, status history (PENDING), payment (COD, UNPAID, LIVE),
   coupon redemption
9. `RESERVE` movements at the default online location (any shortfall rolls
   everything back)
10. the cart is deleted

After commit: the stock cache tag is refreshed, the cookie removed, and
`order.placed` goes to the notification hook with the order number and total
only. Orders are not cancelled automatically.

Before the transaction: honeypot field, minimum fill time
(`checkout.minFillSeconds`), form older than 24 h. Every refusal is logged in
`CheckoutRejection` with keyed hashes of the phone and IP, never the values.

Review flags (`Order.reviewReasons`, shown as "Review" in the admin):
`LARGE_QUANTITY` (≥ `checkout.reviewItemsAtLeast` units) and
`FIRST_ORDER_HIGH_VALUE` (first order for the phone, total ≥
`checkout.reviewFirstOrderAtLeastPoisha`).

## Confirmation and tracking

- `/order/<publicToken>`: unguessable URL, phone masked.
- `/track-order`: order number + phone; any mismatch gets the same answer;
  `checkout.trackAttemptsPer15Min` tries per IP. Wrong coupon codes are
  limited the same way (`checkout.couponAttemptsPer15Min`).

## Admin

| Page                       | Permission          |
| -------------------------- | ------------------- |
| `/admin/orders` (read)     | `order.read`        |
| `/admin/coupons`           | `coupon.manage`     |
| `/admin/shipping`          | `shipping.manage`   |
| `/admin/blocked-phones`    | `customer.block`    |
| `/admin/checkout-settings` | `checkout.settings` |

Phones are masked without `customer.read`. A coupon that has been used cannot
be deleted or renamed. There is always one active fallback zone. Every change
is audited with before/after values.
