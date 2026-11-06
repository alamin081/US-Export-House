import { createNavigation } from "next-intl/navigation";

import { routing } from "./routing";

/**
 * Locale-aware wrappers around the Next.js navigation APIs. Always import
 * `Link`, `redirect`, `usePathname` and `useRouter` from here inside
 * `src/app/[locale]` so that URLs keep the right locale prefix.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
