import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold tracking-wide transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-ring/10",
  {
    variants: {
      variant: {
        default: "border-transparent bg-[#0F172A] text-white",
        secondary: "border-transparent bg-slate-100 text-slate-700",
        outline: "border-slate-200 bg-white text-slate-700",
        success: "border-emerald-200 bg-emerald-50 text-emerald-700",
        warning: "border-amber-200 bg-amber-50 text-amber-800",
        destructive: "border-rose-200 bg-rose-50 text-rose-700",
        info: "border-[#D4A017]/20 bg-[#D4A017]/10 text-[#8A6510]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }