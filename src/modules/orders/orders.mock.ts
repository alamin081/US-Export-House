/**
 * ============================================================================
 * PHASE 3 MOCK ORDERS — NOT REAL DATA
 * ============================================================================
 *
 * Sample orders for the customer account and order tracking screens. The status
 * values are the real ones from the master spec, so the UI built against them
 * does not change in Phase 9:
 *
 *   PENDING -> CONFIRMED -> PROCESSING -> SHIPPED -> DELIVERED
 *   CANCELLED (before shipping), RETURNED (after delivery)
 *
 * Payment status is tracked separately from order status, as it must be.
 */
import { formatOrderNumber } from "@/config/constants";
import type { LocalizedText } from "@/lib/content";

export const ORDER_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "RETURNED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type PaymentStatus = "UNPAID" | "PAID" | "FAILED" | "REFUNDED" | "PARTIALLY_REFUNDED";

export type PaymentMethod = "COD" | "SSLCOMMERZ" | "CASH" | "CARD";

/** The happy path, used to draw the tracking progress bar. */
export const ORDER_PROGRESS: readonly OrderStatus[] = [
  "CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
];

export interface MockOrderItem {
  productSlug: string;
  name: LocalizedText;
  sku: string;
  size: string;
  colour: LocalizedText;
  quantity: number;
  unitPricePoisha: number;
  image: string;
}

export interface MockOrderEvent {
  status: OrderStatus;
  at: string;
  note: LocalizedText;
}

export interface MockAddress {
  fullName: string;
  phone: string;
  line1: LocalizedText;
  area: LocalizedText;
  city: LocalizedText;
  postcode: string;
  /** Drives the shipping rate; the real zone list lives in `ShippingZone`. */
  zone: "inside_dhaka" | "outside_dhaka";
  isDefault: boolean;
  label: LocalizedText;
}

export interface MockShipment {
  courier: string;
  consignmentId: string;
  /** Phase 3/11: no real courier booking exists, so this is always "mock". */
  mode: "mock" | "sandbox" | "live";
}

export interface MockOrder {
  orderNumber: string;
  placedAt: string;
  channel: "ONLINE" | "STORE";
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  items: readonly MockOrderItem[];
  subtotalPoisha: number;
  shippingPoisha: number;
  discountPoisha: number;
  totalPoisha: number;
  couponCode?: string;
  address: MockAddress;
  timeline: readonly MockOrderEvent[];
  shipment?: MockShipment;
  /** Which location fulfilled it - branch or warehouse (spec section 4.5). */
  fulfilledFrom: string;
}

const ADDRESS_HOME: MockAddress = {
  fullName: "Imran Hossain",
  phone: "+8801712345678",
  line1: { en: "House 42, Road 11", bn: "বাড়ি 42, রোড 11" },
  area: { en: "Banani", bn: "বনানী" },
  city: { en: "Dhaka", bn: "ঢাকা" },
  postcode: "1213",
  zone: "inside_dhaka",
  isDefault: true,
  label: { en: "Home", bn: "বাসা" },
};

const ADDRESS_OFFICE: MockAddress = {
  fullName: "Imran Hossain",
  phone: "+8801712345678",
  line1: { en: "Level 7, Placeholder Tower", bn: "লেভেল 7, প্লেসহোল্ডার টাওয়ার" },
  area: { en: "Tejgaon", bn: "তেজগাঁও" },
  city: { en: "Dhaka", bn: "ঢাকা" },
  postcode: "1208",
  zone: "inside_dhaka",
  isDefault: false,
  label: { en: "Office", bn: "অফিস" },
};

export const MOCK_ADDRESSES: readonly MockAddress[] = [ADDRESS_HOME, ADDRESS_OFFICE];

export const MOCK_CUSTOMER = {
  name: "Imran Hossain",
  phone: "+8801712345678",
  email: "placeholder@example.com",
  memberSince: "2024-03-12",
  /** Loyalty, store credit and wishlist are out of scope for now. */
  orderCount: 3,
} as const;

export const MOCK_ORDERS: readonly MockOrder[] = [
  {
    orderNumber: formatOrderNumber(2026, 1),
    placedAt: "2026-11-02T10:24:00+06:00",
    channel: "ONLINE",
    status: "SHIPPED",
    paymentStatus: "UNPAID",
    paymentMethod: "COD",
    items: [
      {
        productSlug: "classic-white-oxford-shirt",
        name: { en: "Classic White Oxford Shirt", bn: "ক্লাসিক সাদা অক্সফোর্ড শার্ট" },
        sku: "UEH-FS-1001",
        size: "L",
        colour: { en: "White", bn: "সাদা" },
        quantity: 2,
        unitPricePoisha: 249_000,
        image: "/images/products/formal-shirts-1.svg",
      },
      {
        productSlug: "pique-polo-charcoal",
        name: { en: "Pique Polo — Charcoal", bn: "পিকে পোলো — চারকোল" },
        sku: "UEH-PL-3001",
        size: "L",
        colour: { en: "Charcoal", bn: "চারকোল" },
        quantity: 1,
        unitPricePoisha: 149_000,
        image: "/images/products/polo-t-shirts-1.svg",
      },
    ],
    subtotalPoisha: 647_000,
    shippingPoisha: 0,
    discountPoisha: 0,
    totalPoisha: 647_000,
    address: ADDRESS_HOME,
    fulfilledFrom: "Central Warehouse",
    shipment: { courier: "Steadfast", consignmentId: "MOCK-CN-884201", mode: "mock" },
    timeline: [
      {
        status: "CONFIRMED",
        at: "2026-11-02T10:26:00+06:00",
        note: { en: "Order confirmed", bn: "অর্ডার কনফার্ম হয়েছে" },
      },
      {
        status: "PROCESSING",
        at: "2026-11-02T15:10:00+06:00",
        note: { en: "Packed at Central Warehouse", bn: "সেন্ট্রাল ওয়্যারহাউসে প্যাক হয়েছে" },
      },
      {
        status: "SHIPPED",
        at: "2026-11-03T09:40:00+06:00",
        note: { en: "Handed to the courier", bn: "কুরিয়ারে হস্তান্তর করা হয়েছে" },
      },
    ],
  },
  {
    orderNumber: formatOrderNumber(2026, 2),
    placedAt: "2026-10-21T18:02:00+06:00",
    channel: "ONLINE",
    status: "DELIVERED",
    paymentStatus: "PAID",
    paymentMethod: "SSLCOMMERZ",
    items: [
      {
        productSlug: "slim-fit-indigo-jeans",
        name: { en: "Slim Fit Indigo Jeans", bn: "স্লিম ফিট ইন্ডিগো জিন্স" },
        sku: "UEH-DJ-4001",
        size: "32",
        colour: { en: "Indigo", bn: "ইন্ডিগো" },
        quantity: 1,
        unitPricePoisha: 349_000,
        image: "/images/products/denim-jeans-1.svg",
      },
    ],
    subtotalPoisha: 349_000,
    shippingPoisha: 7_000,
    discountPoisha: 34_900,
    totalPoisha: 321_100,
    couponCode: "WELCOME10",
    address: ADDRESS_HOME,
    fulfilledFrom: "Central Warehouse",
    shipment: { courier: "Steadfast", consignmentId: "MOCK-CN-871455", mode: "mock" },
    timeline: [
      {
        status: "CONFIRMED",
        at: "2026-10-21T18:05:00+06:00",
        note: { en: "Order confirmed", bn: "অর্ডার কনফার্ম হয়েছে" },
      },
      {
        status: "PROCESSING",
        at: "2026-10-22T11:20:00+06:00",
        note: { en: "Packed at Central Warehouse", bn: "সেন্ট্রাল ওয়্যারহাউসে প্যাক হয়েছে" },
      },
      {
        status: "SHIPPED",
        at: "2026-10-22T17:45:00+06:00",
        note: { en: "Handed to the courier", bn: "কুরিয়ারে হস্তান্তর করা হয়েছে" },
      },
      {
        status: "DELIVERED",
        at: "2026-10-23T13:12:00+06:00",
        note: { en: "Delivered and signed for", bn: "ডেলিভারি সম্পন্ন" },
      },
    ],
  },
  {
    orderNumber: formatOrderNumber(2026, 3),
    placedAt: "2026-09-30T12:48:00+06:00",
    channel: "STORE",
    status: "DELIVERED",
    paymentStatus: "PAID",
    paymentMethod: "CASH",
    items: [
      {
        productSlug: "olive-linen-blend-shirt",
        name: { en: "Olive Linen Blend Shirt", bn: "অলিভ লিনেন ব্লেন্ড শার্ট" },
        sku: "UEH-CS-2002",
        size: "M",
        colour: { en: "Olive", bn: "অলিভ" },
        quantity: 1,
        unitPricePoisha: 245_000,
        image: "/images/products/casual-shirts-2.svg",
      },
    ],
    subtotalPoisha: 245_000,
    shippingPoisha: 0,
    discountPoisha: 0,
    totalPoisha: 245_000,
    address: ADDRESS_OFFICE,
    fulfilledFrom: "Gulshan Showroom",
    timeline: [
      {
        status: "DELIVERED",
        at: "2026-09-30T12:48:00+06:00",
        note: { en: "Purchased in store", bn: "শো-রুম থেকে কেনা" },
      },
    ],
  },
];

export function getOrders(): readonly MockOrder[] {
  return MOCK_ORDERS;
}

export function getOrderByNumber(orderNumber: string): MockOrder | undefined {
  const normalised = orderNumber.trim().toUpperCase();
  return MOCK_ORDERS.find((order) => order.orderNumber === normalised);
}

/**
 * Tracking lookup. Phase 9 replaces this with a service call that also checks
 * the phone number against the order, so one order number alone is not enough
 * to read someone else's delivery address.
 */
export function findOrderForTracking(orderNumber: string, phone: string): MockOrder | undefined {
  const order = getOrderByNumber(orderNumber);
  if (order === undefined) return undefined;

  const digitsOnly = (value: string) => value.replace(/\D/g, "");
  const given = digitsOnly(phone);
  if (given.length < 6) return undefined;

  return digitsOnly(order.address.phone).endsWith(given.slice(-6)) ? order : undefined;
}

/** Index of a status on the happy path, or -1 for cancelled/returned orders. */
export function progressIndex(status: OrderStatus): number {
  return ORDER_PROGRESS.indexOf(status);
}
