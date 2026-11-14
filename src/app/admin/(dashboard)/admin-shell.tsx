"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  BadgeCheck,
  Boxes,
  ChartNoAxesColumn,
  ExternalLink,
  FolderTree,
  Gauge,
  LayoutTemplate,
  LogOut,
  type LucideIcon,
  MapPin,
  Menu,
  Palette,
  Receipt,
  RotateCcw,
  Ruler,
  ScrollText,
  Settings,
  Shield,
  Shirt,
  Store,
  Tags,
  Truck,
  UserRound,
  Users,
  X,
} from "lucide-react";

import { Select } from "@/components/ui/select";
import { logoutAction } from "@/modules/access/auth.actions";
import { cn } from "@/lib/utils";
import { ADMIN_GROUP_LABELS, type AdminNavItem } from "./admin-nav";

const ICONS: Record<string, LucideIcon> = {
  gauge: Gauge,
  shirt: Shirt,
  tags: Tags,
  "folder-tree": FolderTree,
  badge: BadgeCheck,
  palette: Palette,
  ruler: Ruler,
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

export interface ShellStaff {
  name: string | null;
  email: string;
  roleName: string;
}

export interface ShellLocation {
  id: string;
  code: string;
  nameEn: string;
}

/**
 * Admin dashboard shell: sidebar (drawer below `lg`), top bar with the
 * location switcher and the signed-in staff member.
 *
 * Receives only what the server already decided this staff member may see:
 * the filtered navigation and the accessible locations.
 */
export function AdminShell({
  staff,
  nav,
  locations,
  allLocations,
  children,
}: {
  staff: ShellStaff;
  nav: readonly AdminNavItem[];
  locations: readonly ShellLocation[];
  allLocations: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const sidebar = (
    <nav aria-label="Admin sections" className="flex flex-col gap-7 px-4 py-6">
      {GROUP_ORDER.map((group) => {
        const items = nav.filter((item) => item.group === group);
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

  const initials = (staff.name ?? staff.email)
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

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

            <div className="ms-auto flex items-center gap-2 sm:gap-3">
              {/* Lists only the locations this staff member may see. Switching
                  the working location arrives with inventory in Phase 7. */}
              <div className="w-40 sm:w-56">
                <label htmlFor="admin-location" className="sr-only">
                  Location
                </label>
                <Select
                  id="admin-location"
                  defaultValue={allLocations ? "all" : (locations[0]?.id ?? "none")}
                  disabled
                  title="Switching the working location arrives in Phase 7"
                >
                  {allLocations ? <option value="all">All locations</option> : null}
                  {locations.length === 0 && !allLocations ? (
                    <option value="none">No locations assigned</option>
                  ) : null}
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.nameEn}
                    </option>
                  ))}
                </Select>
              </div>

              <Link
                href="/"
                className="hidden items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground md:inline-flex"
              >
                View store
                <ExternalLink aria-hidden="true" className="size-3.5" />
              </Link>

              <Link
                href="/admin/account"
                className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-secondary"
                title="My account"
              >
                <span
                  aria-hidden="true"
                  className="inline-flex size-9 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
                >
                  {initials}
                </span>
                <span className="hidden min-w-0 flex-col leading-tight xl:flex">
                  <span className="truncate text-sm font-medium">{staff.name ?? staff.email}</span>
                  <span className="truncate text-xs text-muted-foreground">{staff.roleName}</span>
                </span>
                <UserRound aria-hidden="true" className="size-4 text-muted-foreground xl:hidden" />
                <span className="sr-only">My account</span>
              </Link>

              <form action={logoutAction}>
                <button
                  type="submit"
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input px-3 text-xs font-medium hover:bg-secondary"
                >
                  <LogOut aria-hidden="true" className="size-3.5" />
                  <span className="hidden sm:inline">Sign out</span>
                  <span className="sr-only sm:hidden">Sign out</span>
                </button>
              </form>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
