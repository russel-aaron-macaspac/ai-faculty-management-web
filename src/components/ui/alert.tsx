import * as React from "react"

import { cn } from "@/lib/utils"

function Alert({ className, variant = "default", ...props }: React.HTMLAttributes<HTMLDivElement> & { variant?: "default" | "success" | "warning" | "destructive" | "info" }) {
  const variantClassName = {
    default: "border-slate-200 bg-white text-slate-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    destructive: "border-rose-200 bg-rose-50 text-rose-900",
    info: "border-[#D4A017]/20 bg-[#D4A017]/10 text-[#0F172A]",
  }[variant]

  return <div role="alert" className={cn("rounded-[12px] border p-4 shadow-sm", variantClassName, className)} {...props} />
}

function AlertTitle({ className, ...props }: Readonly<React.HTMLAttributes<HTMLDivElement>>) {
  return <div className={cn("font-semibold leading-tight text-slate-900", className)} {...props} />
}

function AlertDescription({ className, ...props }: Readonly<React.HTMLAttributes<HTMLParagraphElement>>) {
  return <p className={cn("mt-1 text-sm text-slate-600", className)} {...props} />
}

export { Alert, AlertDescription, AlertTitle }