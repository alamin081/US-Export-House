import { cn } from "@/lib/utils";

export type CheckboxProps = Omit<React.ComponentProps<"input">, "type">;

export function Checkbox({ className, ...props }: CheckboxProps) {
  return (
    <input
      type="checkbox"
      className={cn(
        "size-4 shrink-0 rounded-sm border border-input accent-primary",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
      {...props}
    />
  );
}

export type RadioProps = Omit<React.ComponentProps<"input">, "type">;

export function Radio({ className, ...props }: RadioProps) {
  return (
    <input
      type="radio"
      className={cn(
        "size-4 shrink-0 border-input accent-primary",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
      {...props}
    />
  );
}
