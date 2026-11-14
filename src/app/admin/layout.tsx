import type { Metadata } from "next";

import { fontVariables } from "@/lib/fonts";

import "../globals.css";

/**
 * Admin root layout: document shell only.
 *
 * The dashboard sits outside `[locale]` on purpose: it is English-only for now
 * (master spec section 3.6) and must never be indexed. Access control lives in
 * `(dashboard)/layout.tsx`, so the sign-in page in `(auth)` stays reachable.
 */
export const metadata: Metadata = {
  title: {
    default: "Admin · US Export House",
    template: "%s · Admin",
  },
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" suppressHydrationWarning>
      <body className={`${fontVariables} min-h-dvh bg-background text-foreground antialiased`}>
        {children}
      </body>
    </html>
  );
}
