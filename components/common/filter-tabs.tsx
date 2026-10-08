"use client"

import {
  SegmentGroup,
  SegmentGroupItem,
  SegmentGroupItemText,
} from "@/components/ui/segment-group"
import { cn } from "@/lib/utils"

// Shark's SegmentGroup ships unstyled apart from the sliding indicator, so
// the container and item styling live here, once, for every filter bar.
export function FilterTabs<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: React.ReactNode }[]
  label: string
  className?: string
}) {
  return (
    <SegmentGroup
      value={value}
      onValueChange={(d) => {
        if (d.value) onChange(d.value as T)
      }}
      aria-label={label}
      className={cn(
        "max-w-full gap-1 self-start overflow-x-auto rounded-lg border bg-card p-1",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
    >
      {options.map((o) => (
        <SegmentGroupItem
          key={o.value}
          value={o.value}
          className={cn(
            "flex min-h-10 shrink-0 items-center rounded-md px-3 text-sm font-medium whitespace-nowrap",
            "text-muted-foreground transition-colors hover:text-foreground data-[state=checked]:text-foreground"
          )}
        >
          <SegmentGroupItemText>{o.label}</SegmentGroupItemText>
        </SegmentGroupItem>
      ))}
    </SegmentGroup>
  )
}
