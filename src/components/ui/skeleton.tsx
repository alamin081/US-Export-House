import { cn } from "@/lib/utils";

/** Loading placeholder. Keep it to a quiet pulse - no shimmer gradients. */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("animate-pulse rounded-md bg-secondary", className)} {...props} />;
}

export function Separator({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<"div"> & { orientation?: "horizontal" | "vertical" }) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(
        "bg-border",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      {...props}
    />
  );
}
