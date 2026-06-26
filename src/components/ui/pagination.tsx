import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

function Pagination(props: Readonly<React.ComponentProps<"nav">>) {
  const { className, ...rest } = props

  return <nav aria-label="pagination" className={cn("flex items-center justify-between gap-3", className)} {...rest} />
}

function PaginationContent(props: Readonly<React.ComponentProps<"div">>) {
  const { className, ...rest } = props

  return <div className={cn("flex flex-wrap items-center gap-2", className)} {...rest} />
}

function PaginationItem(props: Readonly<React.ComponentProps<"div">>) {
  const { className, ...rest } = props

  return <div className={cn("flex items-center", className)} {...rest} />
}

function PaginationPrevious(props: Readonly<React.ComponentProps<typeof Button> & { disabled?: boolean }>) {
  const { className, disabled, ...rest } = props

  return (
    <Button variant="outline" size="sm" className={cn("gap-2", className)} disabled={disabled} {...rest}>
      <ChevronLeft className="h-4 w-4" />
      Previous
    </Button>
  )
}

function PaginationNext(props: Readonly<React.ComponentProps<typeof Button> & { disabled?: boolean }>) {
  const { className, disabled, ...rest } = props

  return (
    <Button variant="outline" size="sm" className={cn("gap-2", className)} disabled={disabled} {...rest}>
      Next
      <ChevronRight className="h-4 w-4" />
    </Button>
  )
}

function PaginationButton(props: Readonly<React.ComponentProps<typeof Button> & { active?: boolean }>) {
  const { className, active = false, ...rest } = props

  return <Button variant={active ? "default" : "outline"} size="sm" className={cn("min-w-9 px-3", className)} {...rest} />
}

function PaginationEllipsis(props: Readonly<React.HTMLAttributes<HTMLSpanElement>>) {
  const { className, ...rest } = props

  return <span aria-hidden="true" className={cn("px-2 text-slate-400", className)} {...rest}>...</span>
}

export {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
  PaginationButton,
  PaginationEllipsis,
}