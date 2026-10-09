"use client"

// Pick the sheets a blast sends to, grouped by client. Rows are big toggles.
// On phones the list isn't its own scroller: the dialog (a bottom sheet) scrolls
// as one, which is easier with a thumb than a scroll area inside a scroll area.

import { SearchIcon } from "lucide-react"
import * as React from "react"
import { CheckMark } from "@/components/common/check-mark"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { MAX_BLAST_SHEETS } from "@/lib/blasts/types"
import type { Sheet } from "@/lib/leads/sheets"
import { formatRelative } from "@/lib/format"
import { cn } from "@/lib/utils"

export function SheetPicker({
  sheets,
  value,
  onChange,
  error,
}: {
  sheets: Sheet[]
  value: string[]
  onChange: (ids: string[]) => void
  error?: string
}) {
  const [search, setSearch] = React.useState("")
  const picked = new Set(value)
  const q = search.trim().toLowerCase()
  const groups = new Map<string, { client: string; sheets: Sheet[] }>()
  for (const s of sheets) {
    if (q && !`${s.title} ${s.client} ${s.fileName}`.toLowerCase().includes(q))
      continue
    const g = groups.get(s.clientKey) ?? {
      client: s.client || "No client",
      sheets: [],
    }
    g.sheets.push(s)
    groups.set(s.clientKey, g)
  }
  const full = value.length >= MAX_BLAST_SHEETS
  const pickedLeads = sheets
    .filter((s) => picked.has(s.id))
    .reduce((n, s) => n + s.people, 0)

  function toggle(id: string) {
    if (picked.has(id)) onChange(value.filter((v) => v !== id))
    else if (!full) onChange([...value, id])
  }

  function toggleGroup(ids: string[]) {
    const allOn = ids.every((id) => picked.has(id))
    if (allOn) onChange(value.filter((v) => !ids.includes(v)))
    else
      onChange(
        [...value, ...ids.filter((id) => !picked.has(id))].slice(
          0,
          MAX_BLAST_SHEETS
        )
      )
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <InputGroup className="h-10">
        <InputGroupAddon>
          <SearchIcon aria-hidden />
        </InputGroupAddon>
        <InputGroupInput
          type="search"
          placeholder="Search sheets or clients"
          aria-label="Search sheets"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </InputGroup>
      {groups.size === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          {sheets.length ? "No sheets match." : "Import a sheet first."}
        </p>
      ) : (
        <div className="flex min-w-0 flex-col gap-4 overflow-x-hidden overscroll-contain rounded-xl border p-2 sm:max-h-[min(26rem,50dvh)] sm:overflow-y-auto">
          {[...groups.entries()].map(([key, g]) => {
            const ids = g.sheets.map((s) => s.id)
            const on = ids.filter((id) => picked.has(id)).length
            return (
              <div
                key={key}
                className="flex min-w-0 flex-col gap-1"
                role="group"
                aria-label={g.client}
              >
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on === ids.length ? true : on ? "mixed" : false}
                  onClick={() => toggleGroup(ids)}
                  className="flex min-h-11 w-full min-w-0 items-center gap-3 rounded-lg px-2 text-left text-sm font-semibold outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40"
                >
                  <CheckMark
                    checked={on === ids.length}
                    indeterminate={on > 0}
                  />
                  <span className="min-w-0 truncate">{g.client}</span>
                  <span className="ms-auto shrink-0 text-xs font-normal text-muted-foreground">
                    {ids.length} {ids.length === 1 ? "sheet" : "sheets"}
                  </span>
                </button>
                {g.sheets.map((s) => {
                  const checked = picked.has(s.id)
                  return (
                    <button
                      key={s.id}
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      disabled={!checked && full}
                      onClick={() => toggle(s.id)}
                      className={cn(
                        "flex min-h-12 w-full min-w-0 items-center gap-3 rounded-lg py-2 ps-4 pe-2 text-left outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:opacity-50 sm:ps-7",
                        checked && "bg-accent/60"
                      )}
                    >
                      <CheckMark checked={checked} />
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 text-sm break-words">
                          {s.title}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {s.people.toLocaleString()}{" "}
                          {s.people === 1 ? "lead" : "leads"} ·{" "}
                          {formatRelative(s.createdAt)}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
      <p
        className={cn(
          "text-sm",
          error ? "text-destructive-foreground" : "text-muted-foreground"
        )}
      >
        {error ??
          (value.length
            ? `${value.length} ${value.length === 1 ? "sheet" : "sheets"} picked, ${pickedLeads.toLocaleString()} ${pickedLeads === 1 ? "lead" : "leads"}${full ? ". That's the most a blast can have" : ""}.`
            : "No sheets picked.")}
      </p>
    </div>
  )
}
