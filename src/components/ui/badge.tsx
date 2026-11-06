import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-[0.6875rem] font-medium tracking-wide uppercase",
  {
    variants: {
      variant: {
        solid: "bg-primary text-primary-foreground",
        accent: "bg-accent text-accent-foreground",
        outline: "border border-border bg-card text-muted-foreground",
        muted: "bg-secondary text-muted-foreground",
        success: "bg-success text-success-foreground",
        destructive: "bg-destructive text-destructive-foreground",
      },
    },
    defaultVariants: { variant: "solid" },
  },
);

export type BadgeProps = React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

/**
 * Marks sample content so nothing on screen can be mistaken for real data
 * (spec section 8: mock data must be visibly labelled).
 */
export function PlaceholderBadge({ label }: { label: string }) {
  return (
    <Badge variant="outline" className="border-dashed">
      {label}
    </Badge>
  );
}
