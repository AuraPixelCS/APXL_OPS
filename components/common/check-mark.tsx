import { CheckIcon, MinusIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * The look of a checkbox, for rows that are themselves the toggle button
 * (role="checkbox"), so the whole row is a big touch target.
 */
export function CheckMark({
  checked,
  indeterminate,
  className,
}: {
  checked: boolean
  indeterminate?: boolean
  className?: string
}) {
  const on = checked || indeterminate
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-5 shrink-0 items-center justify-center rounded-[5px] border transition-colors",
        on
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-input/32",
        className
      )}
    >
      {indeterminate && !checked ? (
        <MinusIcon className="size-3.5" />
      ) : checked ? (
        <CheckIcon className="size-3.5" strokeWidth={3} />
      ) : null}
    </span>
  )
}
