import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  className,
}: {
  icon: LucideIcon
  title: string
  body?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-14 text-center",
        className
      )}
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="space-y-1">
        <h2 className="font-heading text-base font-semibold">{title}</h2>
        {body && (
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            {body}
          </p>
        )}
      </div>
      {action}
    </div>
  )
}
