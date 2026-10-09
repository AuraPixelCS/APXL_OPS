"use client"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldError,
  FieldHelper,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { formatRelative } from "@/lib/format"
import { cn } from "@/lib/utils"

export function TextField({
  label,
  value,
  onChange,
  error,
  helper,
  type = "text",
  placeholder,
  inputMode,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  error?: string
  helper?: React.ReactNode
  type?: string
  placeholder?: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]
}) {
  return (
    <Field invalid={Boolean(error)}>
      <FieldLabel>{label}</FieldLabel>
      <Input
        type={type}
        size="lg"
        className="h-10"
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
      />
      {helper && !error && <FieldHelper>{helper}</FieldHelper>}
      <FieldError>{error}</FieldError>
    </Field>
  )
}

export function AreaField({
  label,
  value,
  onChange,
  error,
  helper,
  rows = 5,
  max,
  mono,
}: {
  label: React.ReactNode
  value: string
  onChange: (v: string) => void
  error?: string
  helper?: React.ReactNode
  rows?: number
  max?: number
  mono?: boolean
}) {
  return (
    <Field invalid={Boolean(error)}>
      <FieldLabel>{label}</FieldLabel>
      <Textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "min-h-24 leading-relaxed",
          mono && "font-mono text-[13px]"
        )}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {helper && !error && <FieldHelper>{helper}</FieldHelper>}
          <FieldError>{error}</FieldError>
        </div>
        {max && (
          <span
            className={cn(
              "shrink-0 text-xs text-muted-foreground tabular-nums",
              value.length > max && "text-destructive-foreground"
            )}
          >
            {value.length.toLocaleString()} / {max.toLocaleString()}
          </span>
        )}
      </div>
    </Field>
  )
}

/** Sticky bar at the bottom of a settings tab: unsaved changes, or when it was last saved. */
export function SaveBar({
  dirty,
  saving,
  onSave,
  onDiscard,
  saved,
  updatedAt,
  updatedBy,
}: {
  dirty: boolean
  saving: boolean
  onSave: () => void
  onDiscard: () => void
  saved: boolean
  updatedAt: Date | null
  updatedBy: string | null
}) {
  return (
    <div
      className={cn(
        "-mx-4 mt-2 flex flex-col gap-3 border-t px-4 py-3 sm:-mx-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:-mx-8 lg:px-8",
        // Only pinned to the bottom while there's something to save, so on
        // phones it doesn't take up the screen the rest of the time.
        dirty && "sticky bottom-0 z-10 bg-background/90 backdrop-blur-md",
        "pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      )}
    >
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {dirty
          ? "You have unsaved changes."
          : saved
            ? `Saved ${formatRelative(updatedAt)}${updatedBy ? ` by ${updatedBy}` : ""}.`
            : "Using the starting values. Nothing saved yet."}
      </p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        {dirty && (
          <Button
            variant="outline"
            size="xl"
            onClick={onDiscard}
            disabled={saving}
          >
            Discard
          </Button>
        )}
        <Button
          size="xl"
          onClick={onSave}
          disabled={saving || (!dirty && saved)}
        >
          {saving && <Spinner />}
          {saving ? "Saving…" : saved ? "Save changes" : "Save"}
        </Button>
      </div>
    </div>
  )
}

export function SectionCard({
  title,
  description,
  children,
  className,
}: {
  title: string
  description?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        "flex flex-col gap-5 rounded-xl border bg-card p-5 sm:p-6",
        className
      )}
    >
      <div>
        <h2 className="font-heading text-base font-semibold">{title}</h2>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  )
}
