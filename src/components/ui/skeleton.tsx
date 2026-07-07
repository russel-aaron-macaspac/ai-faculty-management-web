import * as React from "react"

import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: Readonly<React.HTMLAttributes<HTMLDivElement>>) {
  return <div className={cn("animate-pulse rounded-[12px] bg-slate-200/70", className)} {...props} />
}

export { Skeleton }