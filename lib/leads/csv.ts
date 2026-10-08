// Reads a CSV the user picked into plain row objects (header → value).
//
// Meta's "Download leads" export is UTF-16 and tab-separated, while a Google
// Sheets export is UTF-8 with commas, so we sniff the byte-order mark to pick
// the encoding and let Papa Parse detect the delimiter.

import Papa from "papaparse"

export const MAX_IMPORT_ROWS = 5000

function decode(buffer: ArrayBuffer): string {
  const b = new Uint8Array(buffer.slice(0, 3))
  if (b[0] === 0xff && b[1] === 0xfe)
    return new TextDecoder("utf-16le").decode(buffer)
  if (b[0] === 0xfe && b[1] === 0xff)
    return new TextDecoder("utf-16be").decode(buffer)
  return new TextDecoder("utf-8").decode(buffer) // strips a UTF-8 BOM itself
}

export interface ParsedCsv {
  rows: Record<string, string>[]
  columns: string[]
}

export async function parseCsvFile(file: File): Promise<ParsedCsv> {
  const text = decode(await file.arrayBuffer())
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  })
  const columns = (result.meta.fields ?? []).filter(Boolean)
  if (columns.length === 0) throw new Error("This file has no header row.")
  if (result.data.length === 0)
    throw new Error("This file has a header row but no leads.")
  if (result.data.length > MAX_IMPORT_ROWS) {
    throw new Error(
      `This file has ${result.data.length} rows. Import at most ${MAX_IMPORT_ROWS} at a time.`
    )
  }
  return { rows: result.data, columns }
}
