import { cn } from "@/lib/utils";

export type LabelProps = React.ComponentProps<"label"> & {
  /** Renders the required marker and keeps it out of the accessible name. */
  required?: boolean;
};

export function Label({ className, children, required, ...props }: LabelProps) {
  return (
    <label className={cn("mb-1.5 block text-sm font-medium", className)} {...props}>
      {children}
      {required ? (
        <span aria-hidden="true" className="ml-0.5 text-destructive">
          *
        </span>
      ) : null}
    </label>
  );
}

/** Helper or error text tied to a field through `aria-describedby`. */
export function FieldHint({
  className,
  tone = "muted",
  ...props
}: React.ComponentProps<"p"> & { tone?: "muted" | "error" }) {
  return (
    <p
      className={cn(
        "mt-1.5 text-xs",
        tone === "error" ? "text-destructive" : "text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
