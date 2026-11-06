import { PackageOpen } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  title: string;
  description: string;
  action?: { label: string; href: string };
  icon?: React.ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, icon, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-16 text-center",
        className,
      )}
    >
      <span className="mb-4 text-muted-foreground" aria-hidden="true">
        {icon ?? <PackageOpen className="size-8" />}
      </span>
      <h2 className="text-base font-medium">{title}</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action === undefined ? null : (
        <Link href={action.href} className={cn(buttonVariants({ variant: "primary" }), "mt-6")}>
          {action.label}
        </Link>
      )}
    </div>
  );
}

/** Inline error panel for a failed section, kept visually calm. */
export function ErrorPanel({
  title,
  description,
  onRetry,
  retryLabel,
  className,
}: {
  title: string;
  description: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn("rounded-lg border border-destructive/30 bg-destructive/5 p-6", className)}
    >
      <h2 className="text-sm font-semibold text-destructive">{title}</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
      {onRetry === undefined ? null : (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
