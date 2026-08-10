import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-primary/30 bg-primary/15 text-primary shadow-[0_0_8px_hsl(260_80%_60%/0.15)] hover:bg-primary/25",
        secondary:
          "border-secondary bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-destructive/30 bg-destructive/15 text-destructive shadow-[0_0_8px_hsl(0_72%_55%/0.15)] hover:bg-destructive/25",
        outline:
          "text-foreground border-border/60 bg-secondary/30",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
