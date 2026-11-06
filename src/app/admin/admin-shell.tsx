"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  Bell,
  Boxes,
  ChartNoAxesColumn,
  ExternalLink,
  Gauge,
  LayoutTemplate,
  type LucideIcon,
  MapPin,
  Menu,
  Receipt,
  RotateCcw,
  ScrollText,
  Search,
  Settings,
  Shield,
  Shirt,
  Store,
  Tags,
  Truck,
  Users,
  X,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ADMIN_GROUP_LABELS, ADMIN_LOCATIONS, ADMIN_NAV, type AdminNavItem } from "./admin-nav";

const ICONS: Record<string, LucideIcon> = {
  gauge: Gauge,
  shirt: Shirt,
  tags: Tags,
  boxes: Boxes,
  "arrow-left-right": ArrowLeftRight,
  receipt: Receipt,
  store: Store,
  "rotate-ccw": RotateCcw,
  truck: Truck,
  users: Users,
  "chart-no-axes-column": ChartNoAxesColumn,
  "scroll-text": ScrollText,
  "map-pin": MapPin,
  shield: Shield,
  "layout-template": LayoutTemplate,
  settings: Settings,
};

const GROUP_ORDER: readonly AdminNavItem["group"][] = [
  "overview",
  "catalogue",
  "operations",
  "insight",
  "system",
];

/**
 * Admin dashboard shell: fixed sidebar from `lg`, slide-over drawer below it,
 * plus the top bar with the location switcher.
 *
 * PHASE 3: visual only. The location switcher, search and notifications are
 * not wired to anything, and every screen is labelled with the phase that
 * delivers it. Permission-based menu filtering arrives with RBAC in Phase 5.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const sidebar = (
    <nav aria-label="Admin sections" className="flex flex-col gap-7 px-4 py-6">
      {GROUP_ORDER.map((group) => {
        const items = ADMIN_NAV.filter((item) => item.group === group);
        if (items.length === 0) return null;

        return (
          <div key={group}>
            <h2 className="px-2 text-[0.6875rem] font-medium tracking-[0.16em] text-muted-foreground uppercase">
              {ADMIN_GROUP_LABELS[group]}
            </h2>
            <ul className="mt-2 flex flex-col gap-0.5">
              {items.map((item) => {
                const Icon = ICONS[item.icon] ?? Gauge;
                const isActive =
                  item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "group flex items-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-foreground/80 hover:bg-secondary hover:text-foreground",
                      )}
                    >
                      <Icon aria-hidden="true" className="size-4 shrink-0" />
                      <span className="flex-1 truncate">{item.label}</span>
                      <span
                        className={cn(
                          "rounded-sm px-1.5 py-0.5 text-[0.625rem] tabular-nums",
                          isActive
                            ? "bg-primary-foreground/15 text-primary-foreground"
                            : "bg-secondary text-muted-foreground",
                        )}
                        title={`Delivered in Phase ${item.phase}`}
                      >
                        P{item.phase}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-dvh bg-secondary/30">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-e border-border bg-background lg:block">
        <div className="flex h-16 items-center border-b border-border px-6">
          <Link href="/admin" className="flex flex-col leading-none">
            <span className="text-sm font-semibold tracking-[0.18em] uppercase">US Export</span>
            <span className="mt-1 text-[0.625rem] tracking-[0.22em] text-muted-foreground uppercase">
              Admin
            </span>
          </Link>
        </div>
        <div className="sticky top-0 max-h-[calc(100dvh-4rem)] overflow-y-auto">{sidebar}</div>
      </aside>

      {/* Mobile drawer */}
      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-foreground/30"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Admin sections"
            className="absolute inset-y-0 start-0 w-[min(18rem,86vw)] overflow-y-auto bg-background shadow-xl"
          >
            <div className="flex h-16 items-center justify-between border-b border-border px-5">
              <span className="text-sm font-semibold tracking-[0.18em] uppercase">Admin</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="inline-flex size-9 items-center justify-center rounded-md hover:bg-secondary"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </div>
            {sidebar}
          </div>
        </div>
      ) : null}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-background">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-expanded={open}
              aria-label="Open menu"
              className="inline-flex size-10 items-center justify-center rounded-md hover:bg-secondary lg:hidden"
            >
              <Menu aria-hidden="true" className="size-5" />
            </button>

            <div className="hidden min-w-0 flex-1 md:block">
              <label htmlFor="admin-search" className="sr-only">
                Search orders, products or customers
              </label>
              <div className="relative max-w-sm">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  id="admin-search"
                  type="search"
                  placeholder="Search orders, products, customers"
                  className="ps-9"
                  disabled
                />
              </div>
            </div>

            <div className="ms-auto flex items-center gap-2 sm:gap-3">
              {/* Location switcher: the multi-branch spine of the dashboard. */}
              <div className="w-40 sm:w-52">
                <label htmlFor="admin-location" className="sr-only">
                  Location
                </label>
                <Select id="admin-location" defaultValue={ADMIN_LOCATIONS[0]} disabled>
                  {ADMIN_LOCATIONS.map((location) => (
                    <option key={location} value={location}>
                      {location}
                    </option>
                  ))}
                </Select>
              </div>

              <button
                type="button"
                aria-label="Notifications"
                disabled
                className="inline-flex size-10 items-center justify-center rounded-md text-muted-foreground"
              >
                <Bell aria-hidden="true" className="size-5" />
              </button>

              <Link
                href="/"
                className="hidden items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground sm:inline-flex"
              >
                View store
                <ExternalLink aria-hidden="true" className="size-3.5" />
              </Link>

              <span
                aria-hidden="true"
                className="inline-flex size-9 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
                title="Signed-in staff member (Phase 5)"
              >
                SA
              </span>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
