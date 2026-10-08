"use client"

// Dialog frame shared by the app's small forms, and a yes/no confirmation.

import { TriangleAlertIcon } from "lucide-react"
import * as React from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"

export function DialogShell({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: React.ReactNode
  footer: React.ReactNode
}) {
  return (
    <Dialog open={open} onOpenChange={(d) => !d.open && onClose()}>
      <DialogContent>
        <DialogHeader title={title} description={description} />
        <DialogBody className="flex flex-col gap-5">{children}</DialogBody>
        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ConfirmDialog({
  open,
  onClose,
  title,
  body,
  confirmLabel,
  destructive,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  title: string
  body: string
  confirmLabel: string
  destructive?: boolean
  onConfirm: () => Promise<void>
}) {
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title={title}
      description={body}
      footer={
        <>
          <Button variant="outline" size="lg" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            size="lg"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              setError(null)
              try {
                await onConfirm()
              } catch (e) {
                setError(e instanceof Error ? e.message : "That didn't work.")
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy && <Spinner />}
            {confirmLabel}
          </Button>
        </>
      }
    >
      {error && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </DialogShell>
  )
}
