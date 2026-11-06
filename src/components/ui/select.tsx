import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

export type SelectProps = React.ComponentProps<"select">;

/**
 * Native select, styled. A native control keeps keyboard and screen-reader
 * behaviour correct and gives mobile users the platform picker.
 */
export function Select({ className, children, ...props }: SelectProps) {
  return (
    <div className="relative">
      <select
        className={cn(
          "h-11 w-full appearance-none rounded-md border border-input bg-card pr-9 pl-3 text-sm",
          "focus-visible:border-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
          "disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}
