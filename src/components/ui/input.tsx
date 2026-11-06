import { cn } from "@/lib/utils";

export type InputProps = React.ComponentProps<"input">;

export function Input({ className, type, ...props }: InputProps) {
  return (
    <input
      type={type ?? "text"}
      className={cn(
        "h-11 w-full rounded-md border border-input bg-card px-3 text-sm",
        "placeholder:text-muted-foreground/70",
        "focus-visible:border-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
        "disabled:cursor-not-allowed disabled:opacity-60",
        "aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}
