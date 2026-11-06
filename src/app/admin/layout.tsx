import type { Metadata } from "next";

import { fontVariables } from "@/lib/fonts";
import { AdminShell } from "./admin-shell";

import "../globals.css";

/**
 * Admin root layout.
 *
 * The dashboard sits outside `[locale]` on purpose: it is English-only for now
 * (master spec section 3.6) and must never be indexed. It carries its own
 * `<html>` because the storefront's locale layout is not an ancestor.
 */
export const metadata: Metadata = {
  title: {
    default: "Admin · US Export House",
    template: "%s · Admin",
  },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" suppressHydrationWarning>
      <body className={`${fontVariables} min-h-dvh bg-background text-foreground antialiased`}>
        <AdminShell>{children}</AdminShell>
      </body>
    </html>
  );
}
