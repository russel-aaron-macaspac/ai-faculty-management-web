"use client"

import * as React from "react"
import { AlertTriangle, MessageSquare } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type PopupDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  prompt?: boolean
  value?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  required?: boolean
  onConfirm: () => void
}

export function PopupDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  prompt = false,
  value = "",
  onValueChange,
  placeholder,
  required = false,
  onConfirm,
}: PopupDialogProps) {
  const canConfirm = !required || value.trim().length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md overflow-hidden p-0">
        <DialogHeader className="gap-3 px-6 pt-6">
          <div className={cn(
            "flex h-11 w-11 items-center justify-center rounded-full",
            destructive || prompt ? "bg-rose-100 text-rose-700" : "bg-blue-100 text-blue-700",
          )}>
            {prompt ? <MessageSquare className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
          </div>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {prompt && (
          <div className="px-6">
            <label htmlFor="popup-dialog-input" className="mb-2 block text-sm font-medium text-slate-700">
              Reason or remarks{required ? " *" : ""}
            </label>
            <Input
              id="popup-dialog-input"
              value={value}
              onChange={(event) => onValueChange?.(event.target.value)}
              placeholder={placeholder}
              autoFocus
            />
          </div>
        )}
        <DialogFooter className="mx-0 mt-2 mb-0 gap-3 px-6 py-5">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            disabled={!canConfirm}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
