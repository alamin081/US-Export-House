import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Button primitive.
 *
 * Minimal, premium: flat fills, one subtle hover, no gradients. Sizes keep a
 * 44px touch target on mobile (`default` and up) for accessibility.
 */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary/90",
        outline: "border border-input bg-transparent hover:bg-secondary",
        secondary: "bg-secondary text-secondary-foreground hover:bg-accent",
        accent: "bg-accent text-accent-foreground hover:brightness-98",
        ghost: "hover:bg-secondary",
        link: "text-foreground underline-offset-4 hover:underline",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
      },
      size: {
        sm: "h-9 px-3 text-xs",
        default: "h-11 px-5",
        lg: "h-12 px-7 text-base",
        icon: "size-11",
        iconSm: "size-9",
      },
      full: {
        true: "w-full",
        false: "",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
      full: false,
    },
  },
);

export type ButtonProps = React.ComponentProps<"button"> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, full, type, ...props }: ButtonProps) {
  return (
    <button
      type={type ?? "button"}
      className={cn(buttonVariants({ variant, size, full }), className)}
      {...props}
    />
  );
}
