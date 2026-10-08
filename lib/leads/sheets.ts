// Sheets = imported files. Each one has a title and the client it belongs to;
// leads are listed under every sheet they appeared in. Shared by the browser
// and /api/leads/import + /api/sheets/*.

export interface Sheet {
  id: string
  title: string
  client: string
  clientKey: string
  fileName: string
  /** The workbook tab it came from ("" for CSV). */
  tabName: string
  /** People in this sheet: new leads plus ones already in Ops for the client. */
  people: number
  created: number
  alreadyInOps: number
  duplicatesInFile: number
  createdBy: string | null
  createdAt: Date | null
}

export const TITLE_MAX = 120
export const CLIENT_MAX = 80

export function tidyName(s: string): string {
  return s.trim().replace(/\s+/g, " ")
}

/** "Skill2U " and "skill2u" are the same client. */
export function clientKeyOf(client: string): string {
  return tidyName(client).toLowerCase()
}

/** "skill2u_leads_march-2026.xlsx" + tab "Week 1" → "skill2u leads march-2026 – Week 1". */
export function titleFromFile(fileName: string, tabName?: string): string {
  const base = tidyName(fileName.replace(/\.[^.]+$/, "").replace(/_+/g, " "))
  const title = tabName ? `${base} – ${tidyName(tabName)}` : base
  return title.slice(0, TITLE_MAX)
}

/** The known client whose name appears in the file name, longest match first. */
export function guessClient(
  fileName: string,
  clients: string[]
): string | null {
  const flat = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")
  const name = flat(fileName)
  const hit = [...clients]
    .filter((c) => flat(c).length >= 3 && name.includes(flat(c)))
    .sort((a, b) => flat(b).length - flat(a).length)[0]
  return hit ?? null
}

export function validateSheetDetails(input: {
  title?: unknown
  client?: unknown
}):
  | { ok: true; title: string; client: string }
  | { ok: false; errors: { title?: string; client?: string } } {
  const title = typeof input.title === "string" ? tidyName(input.title) : ""
  const client = typeof input.client === "string" ? tidyName(input.client) : ""
  const errors: { title?: string; client?: string } = {}
  if (!title) errors.title = "Give this sheet a title."
  else if (title.length > TITLE_MAX)
    errors.title = `Keep it under ${TITLE_MAX} characters.`
  if (!client) errors.client = "Which client are these leads for?"
  else if (client.length > CLIENT_MAX)
    errors.client = `Keep it under ${CLIENT_MAX} characters.`
  return Object.keys(errors).length
    ? { ok: false, errors }
    : { ok: true, title, client }
}
