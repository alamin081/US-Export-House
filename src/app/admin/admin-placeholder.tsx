import { Construction } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * Visual shell for an admin screen that is not built yet.
 *
 * It states plainly which phase delivers the screen and sketches the layout the
 * real version will use, so the structure can be reviewed without pretending
 * anything works.
 */
export function AdminPlaceholder({
  title,
  phase,
  description,
  features,
  layout = "table",
}: {
  title: string;
  phase: number;
  description: string;
  features: readonly string[];
  layout?: "table" | "cards" | "form";
}) {
  return (
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-md border border-dashed border-border bg-background px-3 py-1.5 text-xs text-muted-foreground">
          <Construction aria-hidden="true" className="size-3.5" />
          Built in Phase {phase}
        </span>
      </header>

      <section className="mt-8 rounded-lg border border-border bg-background p-6">
        <h2 className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
          What this screen will do
        </h2>
        <ul className="mt-4 grid gap-2.5 text-sm sm:grid-cols-2">
          {features.map((feature) => (
            <li key={feature} className="flex gap-2 text-muted-foreground">
              <span aria-hidden="true">·</span>
              {feature}
            </li>
          ))}
        </ul>
      </section>

      {/* Layout sketch */}
      <section
        aria-hidden="true"
        className="mt-8 rounded-lg border border-border bg-background p-6"
      >
        {layout === "table" ? (
          <div className="flex flex-col gap-3">
            <div className="flex gap-3">
              <Skeleton className="h-9 w-40" />
              <Skeleton className="h-9 w-28" />
              <Skeleton className="ms-auto h-9 w-32" />
            </div>
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : null}

        {layout === "cards" ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton key={index} className="h-28 w-full" />
            ))}
          </div>
        ) : null}

        {layout === "form" ? (
          <div className="grid gap-5 sm:grid-cols-2">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="flex flex-col gap-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-11 w-full" />
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
