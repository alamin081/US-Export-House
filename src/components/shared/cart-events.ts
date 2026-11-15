/**
 * Lets the header's cart count update the moment the cart changes, without a
 * page reload. Client-only helpers; the count itself always comes from the
 * server (`/api/cart/summary` or a cart action's result).
 */
export const CART_EVENT = "ueh:cart-units";

export function announceCartUnits(units: number): void {
  window.dispatchEvent(new CustomEvent<number>(CART_EVENT, { detail: units }));
}
