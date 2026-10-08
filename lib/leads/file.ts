// Reads a spreadsheet the user picked into tabs of lead rows (browser only).
//
// Text files (CSV, TSV, TXT): Meta's "Download leads" export is UTF-16 and
// tab-separated, a Google Sheets export is UTF-8 with commas, so we sniff the
// byte-order mark and let Papa Parse detect the delimiter.
// Workbooks (XLSX, XLSM, XLS, ODS, Numbers, Excel XML): SheetJS, loaded only
// when needed because it's large. Files are told apart by their first bytes,
// not their extension: some ".xls" downloads are really tab-separated text.

import Papa from "papaparse"
import { cellText, gridToTab, type SheetTab } from "./grid"

export const MAX_FILE_MB = 25

/** For the file picker. Extensions matter: browsers leave some types blank. */
export const SHEET_ACCEPT: Record<string, string[]> = {
  "text/csv": [".csv"],
  "text/tab-separated-values": [".tsv"],
  "text/plain": [".txt"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
    ".xlsx",
  ],
  "application/vnd.ms-excel.sheet.macroEnabled.12": [".xlsm"],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.oasis.opendocument.spreadsheet": [".ods"],
  "application/x-iwork-numbers-sffnumbers": [".numbers"],
}

export const SHEET_FORMATS =
  "CSV, Excel (.xlsx, .xls), Google Sheets, Numbers or OpenDocument (.ods)"

function decode(buffer: ArrayBuffer): string {
  const b = new Uint8Array(buffer.slice(0, 3))
  if (b[0] === 0xff && b[1] === 0xfe)
    return new TextDecoder("utf-16le").decode(buffer)
  if (b[0] === 0xfe && b[1] === 0xff)
    return new TextDecoder("utf-16be").decode(buffer)
  return new TextDecoder("utf-8").decode(buffer) // strips a UTF-8 BOM itself
}

function readText(text: string): SheetTab[] {
  const result = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" })
  return [
    gridToTab(
      "",
      result.data.map((r) => r.map(cellText))
    ),
  ]
}

async function readWorkbook(buffer: ArrayBuffer): Promise<SheetTab[]> {
  const XLSX = await import("xlsx")
  let wb: import("xlsx").WorkBook
  try {
    wb = XLSX.read(buffer, { type: "array", cellDates: true, dense: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ""
    throw new Error(
      /password|encrypt/i.test(msg)
        ? "This file is password-protected. Remove the password, save it, and try again."
        : "We couldn't read this file. Open it and save it again as .xlsx or .csv, then try again."
    )
  }
  const hidden = new Set(
    (wb.Workbook?.Sheets ?? []).filter((s) => s.Hidden).map((s) => s.name)
  )
  return wb.SheetNames.filter((name) => !hidden.has(name)).map((name) => {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], {
      header: 1,
      raw: true,
      defval: "",
      blankrows: false,
    })
    return gridToTab(
      name,
      grid.map((r) => r.map(cellText))
    )
  })
}

/** Every tab in the file, empty ones included (the picker greys them out). */
export async function readSheetFile(file: File): Promise<SheetTab[]> {
  if (file.size > MAX_FILE_MB * 1024 * 1024)
    throw new Error(
      `This file is over ${MAX_FILE_MB} MB. Split it into smaller files.`
    )
  const buffer = await file.arrayBuffer()
  const b = new Uint8Array(buffer.slice(0, 4))
  const zip = b[0] === 0x50 && b[1] === 0x4b // xlsx, xlsm, ods, numbers
  const ole = b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0 // xls
  let tabs: SheetTab[]
  if (zip || ole) tabs = await readWorkbook(buffer)
  else {
    const text = decode(buffer)
    // Excel 2003 XML and HTML "xls" exports
    tabs = /^\s*</.test(text) ? await readWorkbook(buffer) : readText(text)
  }
  if (!tabs.some((t) => t.rows.length)) {
    throw new Error(
      "We couldn't find any leads in this file. It needs a header row (like Name, Email, Phone) with rows under it."
    )
  }
  return tabs
}
