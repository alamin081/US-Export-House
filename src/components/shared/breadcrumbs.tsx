import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

export interface Crumb {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: readonly Crumb[] }) {
  const t = useTranslations("Common");

  return (
    <nav aria-label={t("breadcrumb")} className="text-xs text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-1.5">
        <li className="flex items-center gap-1.5">
          <Link href="/" className="hover:text-foreground hover:underline hover:underline-offset-4">
            {t("home")}
          </Link>
          <ChevronRight aria-hidden="true" className="size-3.5" />
        </li>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
              {item.href === undefined || isLast ? (
                <span aria-current={isLast ? "page" : undefined} className="text-foreground">
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="hover:text-foreground hover:underline hover:underline-offset-4"
                >
                  {item.label}
                </Link>
              )}
              {isLast ? null : <ChevronRight aria-hidden="true" className="size-3.5" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
