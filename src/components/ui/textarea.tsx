import { cn } from "@/lib/utils";

export type TextareaProps = React.ComponentProps<"textarea">;

export function Textarea({ className, rows, ...props }: TextareaProps) {
  return (
    <textarea
      rows={rows ?? 5}
      className={cn(
        "w-full rounded-md border border-input bg-card px-3 py-2.5 text-sm",
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
