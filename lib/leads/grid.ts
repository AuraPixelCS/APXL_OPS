// Turns one sheet's cells into lead rows keyed by column header. Every file type
// ends up here: CSV/TSV text and Excel/ODS/Numbers workbooks are all read into
// a grid (string[][]) first. Pure, so `npm test` covers it.

import { isContactColumn } from "./clean.ts"

export const MAX_IMPORT_ROWS = 5000
/** Title rows above the real header are common in hand-made sheets. */
const HEADER_SCAN = 10

export interface SheetTab {
  /** The workbook tab's name ("" for CSV). */
  name: string
  rows: Record<string, string>[]
  columns: string[]
}

/** A cell as text. Numbers keep every digit (phones), dates read as dates. */
export function cellText(v: unknown): string {
  if (v === null || v === undefined) return ""
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return ""
    const pad = (n: number) => String(n).padStart(2, "0")
    const date = `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`
    return v.getHours() || v.getMinutes()
      ? `${date} ${pad(v.getHours())}:${pad(v.getMinutes())}`
      : date
  }
  if (typeof v === "boolean") return v ? "Yes" : "No"
  return String(v).trim()
}

/**
 * The header row: the first of the top rows that names a name, email or phone
 * column, else the first row with anything in it. -1 when the sheet is empty.
 */
export function findHeaderRow(grid: string[][]): number {
  const known = grid
    .slice(0, HEADER_SCAN)
    .findIndex((r) => r.some((c) => isContactColumn(c)))
  if (known >= 0) return known
  return grid.findIndex((r) => r.some((c) => c.trim()))
}

export function gridToTab(name: string, grid: string[][]): SheetTab {
  const h = findHeaderRow(grid)
  if (h < 0) return { name, rows: [], columns: [] }
  // Blank headers get a name and repeated ones a number, so no column's
  // values overwrite another's.
  const seen = new Map<string, number>()
  const columns = grid[h].map((raw, i) => {
    const base = raw.trim() || `Column ${i + 1}`
    const n = (seen.get(base.toLowerCase()) ?? 0) + 1
    seen.set(base.toLowerCase(), n)
    return n === 1 ? base : `${base} (${n})`
  })
  const rows: Record<string, string>[] = []
  for (const cells of grid.slice(h + 1)) {
    const row: Record<string, string> = {}
    columns.forEach((c, i) => {
      const v = (cells[i] ?? "").trim()
      if (v) row[c] = v
    })
    if (Object.keys(row).length) rows.push(row)
  }
  return { name, rows, columns }
}
