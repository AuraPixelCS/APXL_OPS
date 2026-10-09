// Server-side helpers for blasts: who's in a blast's audience, and checking
// what the browser sent. Server only.
import type { Firestore } from "firebase-admin/firestore"
import { emailDocId } from "@/lib/blasts/email"
import { BLAST_NAME_MAX, MAX_BLAST_SHEETS } from "@/lib/blasts/types"
import { tidyName } from "@/lib/leads/sheets"

export interface AudienceMember {
  email: string
  leadId: string
  /** First name for "Hi {name}", or "there". */
  name: string
}

/**
 * Everyone emailable in the blast's sheets, one entry per address (the same
 * person can be a lead for two clients). The server only ever sends to
 * addresses in here.
 */
export async function loadAudience(
  db: Firestore,
  sheetIds: string[]
): Promise<Map<string, AudienceMember>> {
  const out = new Map<string, AudienceMember>()
  if (!sheetIds.length) return out
  const snap = await db
    .collection("leads")
    .where(
      "sheetIds",
      "array-contains-any",
      sheetIds.slice(0, MAX_BLAST_SHEETS)
    )
    .get()
  const docs = [...snap.docs].sort((a, b) => a.id.localeCompare(b.id))
  for (const d of docs) {
    if (!d.get("emailOk")) continue
    const email = emailDocId(String(d.get("email") ?? ""))
    if (!email || out.has(email)) continue
    out.set(email, {
      email,
      leadId: d.id,
      name: String(d.get("greetingName") ?? "there"),
    })
  }
  return out
}

export function checkBlastName(
  raw: unknown
): { name: string } | { error: string } {
  const name = tidyName(typeof raw === "string" ? raw : "")
  if (!name) return { error: "Give the blast a name." }
  if (name.length > BLAST_NAME_MAX)
    return { error: `Keep it under ${BLAST_NAME_MAX} characters.` }
  return { name }
}

/** Unique sheet ids that exist, 1–30 of them. */
export async function checkSheetIds(
  db: Firestore,
  raw: unknown
): Promise<{ sheetIds: string[] } | { error: string }> {
  const ids = Array.isArray(raw)
    ? [
        ...new Set(
          raw.filter(
            (x): x is string =>
              typeof x === "string" && /^[A-Za-z0-9]{1,40}$/.test(x)
          )
        ),
      ]
    : []
  if (!ids.length) return { error: "Pick at least one sheet." }
  if (ids.length > MAX_BLAST_SHEETS)
    return { error: `Pick at most ${MAX_BLAST_SHEETS} sheets.` }
  const snaps = await db.getAll(...ids.map((id) => db.doc(`imports/${id}`)))
  if (snaps.some((s) => !s.exists))
    return { error: "One of those sheets no longer exists. Pick again." }
  return { sheetIds: ids }
}
