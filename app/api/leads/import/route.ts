// POST /api/leads/import
//   { title, client, fileName, tabName?, rows: Record<string, string>[] }
//
// Saves one sheet (an uploaded file or workbook tab) as leads for a client. The
// browser sends the RAW rows and we clean them again here, so what's stored
// never depends on what the browser computed.
//
// Duplicates are per client: each person gets a stable ID from the client plus
// their email (else phone). Someone already in Ops for this client is left
// exactly as they are, just listed under this sheet too; the same person in
// another client's sheet is a separate lead. Importing never emails anyone.

import { createHash } from "node:crypto"
import { FieldValue } from "firebase-admin/firestore"
import { NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase/admin"
import { verifyAdmin } from "@/lib/firebase/admin-guard"
import { cleanLead, dedupeKey } from "@/lib/leads/clean"
import { MAX_IMPORT_ROWS } from "@/lib/leads/grid"
import { clientKeyOf, validateSheetDetails } from "@/lib/leads/sheets"
import type { CleanLead, ImportResult } from "@/lib/leads/types"
import { databaseErrorResponse } from "@/lib/server-errors"

const READ_CHUNK = 300
const WRITE_CHUNK = 400 // Firestore allows 500 writes per batch

function leadIdFor(clientKey: string, personKey: string): string {
  return createHash("sha256")
    .update(`${clientKey}|${personKey}`)
    .digest("hex")
    .slice(0, 24)
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size))
  return out
}

export async function POST(req: Request) {
  const admin = await verifyAdmin(
    req,
    "Sign in with an admin account to import leads."
  )
  if (admin instanceof Response) return admin
  const db = adminDb()
  if (!db) {
    return NextResponse.json(
      { error: "The database isn't configured on the server." },
      { status: 503 }
    )
  }

  const body = (await req.json().catch(() => null)) as {
    title?: unknown
    client?: unknown
    fileName?: unknown
    tabName?: unknown
    rows?: unknown
  } | null
  const details = validateSheetDetails(body ?? {})
  if (!details.ok) {
    return NextResponse.json(
      { error: "Add a title and a client.", fields: details.errors },
      { status: 400 }
    )
  }
  const rows = Array.isArray(body?.rows) ? body.rows : null
  if (!rows || rows.length === 0) {
    return NextResponse.json(
      { error: "There are no rows to import." },
      { status: 400 }
    )
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    return NextResponse.json(
      { error: `Import at most ${MAX_IMPORT_ROWS} rows at a time.` },
      { status: 400 }
    )
  }
  try {
    const fileName = String(body?.fileName ?? "upload.csv").slice(0, 200)
    const tabName = String(body?.tabName ?? "").slice(0, 120)
    const clientKey = clientKeyOf(details.client)
    // Keep the spelling the client was first imported with.
    const earlier = await db
      .collection("imports")
      .where("clientKey", "==", clientKey)
      .limit(1)
      .get()
    const client: string = earlier.empty
      ? details.client
      : (earlier.docs[0].get("client") ?? details.client)
    const importRef = db.collection("imports").doc()

    // Clean, then keep the first row for each person within this file.
    const seen = new Set<string>()
    const toSave: { id: string; lead: CleanLead }[] = []
    let duplicatesInFile = 0
    for (const row of rows) {
      if (!row || typeof row !== "object") continue
      const lead = cleanLead(row as Record<string, unknown>)
      const key = dedupeKey(lead)
      if (key && seen.has(key)) {
        duplicatesInFile++
        continue
      }
      if (key) seen.add(key)
      // No email and no usable phone: still kept, so nothing silently vanishes.
      const id = key
        ? leadIdFor(clientKey, key)
        : db.collection("leads").doc().id
      toSave.push({ id, lead })
    }

    const existing = new Set<string>()
    for (const group of chunks(toSave, READ_CHUNK)) {
      const snaps = await db.getAll(
        ...group.map(({ id }) => db.collection("leads").doc(id))
      )
      for (const snap of snaps) if (snap.exists) existing.add(snap.id)
    }

    const now = FieldValue.serverTimestamp()
    const by = admin.email ?? admin.uid
    const result: ImportResult = {
      importId: importRef.id,
      title: details.title,
      client,
      created: toSave.length - existing.size,
      alreadyInOps: existing.size,
      duplicatesInFile,
    }
    // The sheet is saved first: if the lead writes fail partway, deleting the
    // sheet removes whatever did get written.
    await importRef.set({
      title: details.title,
      client,
      clientKey,
      fileName,
      tabName,
      rows: rows.length,
      people: toSave.length,
      created: result.created,
      alreadyInOps: result.alreadyInOps,
      duplicatesInFile,
      createdBy: by,
      createdAt: now,
      updatedAt: now,
    })

    for (const group of chunks(toSave, WRITE_CHUNK)) {
      const batch = db.batch()
      for (const { id, lead } of group) {
        const ref = db.collection("leads").doc(id)
        if (existing.has(id)) {
          batch.update(ref, {
            sheetIds: FieldValue.arrayUnion(importRef.id),
            updatedAt: now,
          })
          continue
        }
        batch.set(ref, {
          ...lead,
          status: "new",
          score: null,
          scoreReason: null,
          summary: null,
          client,
          clientKey,
          sheetIds: [importRef.id],
          source: { type: "csv", fileName, importId: importRef.id },
          createdBy: by,
          createdAt: now,
          updatedAt: now,
          lastActivityAt: now,
        })
      }
      await batch.commit()
    }

    return NextResponse.json(result)
  } catch (err) {
    return databaseErrorResponse(err)
  }
}
