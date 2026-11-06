import { ArrowRight } from "lucide-react";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  description?: string;
  /** Optional "view all" link shown on the right on wide screens. */
  action?: { label: string; href: string };
  align?: "start" | "center";
  className?: string;
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  align = "start",
  className,
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        align === "center" && "sm:flex-col sm:items-center sm:text-center",
        className,
      )}
    >
      <div className={cn("max-w-2xl", align === "center" && "sm:mx-auto")}>
        {eyebrow === undefined ? null : (
          <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
            {eyebrow}
          </p>
        )}
        <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
        {description === undefined ? null : (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>

      {action === undefined ? null : (
        <Link
          href={action.href}
          className="group inline-flex shrink-0 items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline"
        >
          {action.label}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}
