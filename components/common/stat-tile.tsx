import { cn } from "@/lib/utils"

export function StatTile({
  label,
  value,
  hint,
  tone = "default",
  className,
}: {
  label: string
  value: React.ReactNode
  hint?: string
  tone?: "default" | "brand" | "warning" | "muted"
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-xl border bg-card p-4",
        className
      )}
    >
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-heading text-2xl font-semibold tracking-tight tabular-nums",
          tone === "brand" && "text-info",
          tone === "warning" && "text-warning",
          tone === "muted" && "text-muted-foreground"
        )}
      >
        {value}
      </span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  )
}
