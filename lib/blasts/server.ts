// Server-side helpers for blasts: who's in a blast's audience, saving files
// uploaded just for a blast, and checking what the browser sent. Server only.
import { FieldValue, type Firestore } from "firebase-admin/firestore"
import { emailDocId } from "@/lib/blasts/email"
import {
  BLAST_NAME_MAX,
  MAX_BLAST_LISTS,
  MAX_BLAST_SHEETS,
} from "@/lib/blasts/types"
import { cleanLead } from "@/lib/leads/clean"
import { MAX_IMPORT_ROWS } from "@/lib/leads/grid"
import { TITLE_MAX, tidyName } from "@/lib/leads/sheets"

export interface AudienceMember {
  email: string
  /** The lead id, or "list:<listId>" for someone from an uploaded file. */
  leadId: string
  /** First name for "Hi {name}", or "there". */
  name: string
}

/**
 * Everyone emailable in the blast's sheets and uploaded files, one entry per
 * address (the same person can be a lead for two clients, or in a sheet and a
 * file). The server only ever sends to addresses in here.
 */
export async function loadAudience(
  db: Firestore,
  sheetIds: string[],
  listIds: string[] = []
): Promise<Map<string, AudienceMember>> {
  const out = new Map<string, AudienceMember>()
  const add = (email: unknown, leadId: string, name: unknown) => {
    const key = emailDocId(String(email ?? ""))
    if (key && !out.has(key))
      out.set(key, { email: key, leadId, name: String(name ?? "there") })
  }
  if (sheetIds.length) {
    const snap = await db
      .collection("leads")
      .where(
        "sheetIds",
        "array-contains-any",
        sheetIds.slice(0, MAX_BLAST_SHEETS)
      )
      .get()
    const docs = [...snap.docs].sort((a, b) => a.id.localeCompare(b.id))
    for (const d of docs)
      if (d.get("emailOk")) add(d.get("email"), d.id, d.get("greetingName"))
  }
  for (const listId of listIds.slice(0, MAX_BLAST_LISTS)) {
    const snap = await db.collection(`blastLists/${listId}/contacts`).get()
    for (const d of snap.docs)
      if (d.get("emailOk"))
        add(d.get("email"), `list:${listId}`, d.get("greetingName"))
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

/** Unique sheet ids that exist, up to 30 (none is fine if `allowNone`). */
export async function checkSheetIds(
  db: Firestore,
  raw: unknown,
  { allowNone = false }: { allowNone?: boolean } = {}
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
  if (!ids.length)
    return allowNone ? { sheetIds: [] } : { error: "Pick at least one sheet." }
  if (ids.length > MAX_BLAST_SHEETS)
    return { error: `Pick at most ${MAX_BLAST_SHEETS} sheets.` }
  const snaps = await db.getAll(...ids.map((id) => db.doc(`imports/${id}`)))
  if (snaps.some((s) => !s.exists))
    return { error: "One of those sheets no longer exists. Pick again." }
  return { sheetIds: ids }
}

export interface UploadedList {
  fileName: string
  tabName: string
  name: string
  rows: Record<string, unknown>[]
}

/** Checks a file the browser read for a blast. */
export function checkUploadedList(
  raw: unknown
): UploadedList | { error: string } {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >
  const rows = Array.isArray(src.rows)
    ? src.rows.filter(
        (r): r is Record<string, unknown> => !!r && typeof r === "object"
      )
    : []
  if (!rows.length) return { error: "That file has no people in it." }
  if (rows.length > MAX_IMPORT_ROWS)
    return {
      error: `Upload at most ${MAX_IMPORT_ROWS.toLocaleString()} people at a time.`,
    }
  const fileName = String(src.fileName ?? "upload.csv").slice(0, 200)
  const tabName = String(src.tabName ?? "").slice(0, 120)
  const name =
    tidyName(String(src.name ?? "")).slice(0, TITLE_MAX) ||
    tidyName(fileName.replace(/\.[^.]+$/, "").replace(/_+/g, " ")) ||
    "Uploaded list"
  return { fileName, tabName, name, rows }
}

/**
 * Saves an uploaded file's people for one blast: cleaned like leads, one
 * contact per address (no-email rows kept so nothing silently vanishes), in
 * blastLists/{id}/contacts. They never go into Leads.
 */
export async function saveBlastList(
  db: Firestore,
  blastId: string,
  list: UploadedList,
  by: string
): Promise<{
  listId: string
  people: number
  canEmail: number
  repeated: number
}> {
  const ref = db.collection("blastLists").doc()
  const seen = new Set<string>()
  const contacts: { id: string; data: Record<string, unknown> }[] = []
  let repeated = 0
  for (const row of list.rows) {
    const lead = cleanLead(row)
    const key = lead.emailOk ? emailDocId(lead.email) : null
    if (key && seen.has(key)) {
      repeated++
      continue
    }
    if (key) seen.add(key)
    contacts.push({
      id: key ?? ref.collection("contacts").doc().id,
      data: {
        email: lead.email,
        emailOk: lead.emailOk,
        name: lead.name,
        greetingName: lead.greetingName,
        phone: lead.phone,
        flags: lead.flags,
        listId: ref.id,
      },
    })
  }
  const canEmail = contacts.filter((c) => c.data.emailOk).length
  await ref.set({
    blastId,
    name: list.name,
    fileName: list.fileName,
    tabName: list.tabName,
    rows: list.rows.length,
    people: contacts.length,
    canEmail,
    repeated,
    createdBy: by,
    createdAt: FieldValue.serverTimestamp(),
  })
  for (let i = 0; i < contacts.length; i += 400) {
    const batch = db.batch()
    contacts.slice(i, i + 400).forEach((c, j) =>
      batch.set(ref.collection("contacts").doc(c.id), {
        ...c.data,
        // keeps the file's order for "send to the first 100"
        order: i + j,
        createdAt: FieldValue.serverTimestamp(),
      })
    )
    await batch.commit()
  }
  return { listId: ref.id, people: contacts.length, canEmail, repeated }
}
