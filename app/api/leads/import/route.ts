// POST /api/leads/import   { fileName, rows: Record<string, string>[] }
//
// Saves a CSV upload as leads. The browser sends the RAW rows and we clean them
// again here, so what's stored never depends on what the browser computed.
// Each person gets a stable ID from their email (else phone), so importing the
// same file twice, or two files that overlap, never creates duplicates: people
// already in Ops are left exactly as they are.
// Importing never emails anyone.

import { createHash } from "node:crypto"
import { FieldValue } from "firebase-admin/firestore"
import { NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase/admin"
import { verifyAdmin } from "@/lib/firebase/admin-guard"
import { cleanLead, dedupeKey } from "@/lib/leads/clean"
import { MAX_IMPORT_ROWS } from "@/lib/leads/csv"
import { databaseErrorResponse } from "@/lib/server-errors"
import type { CleanLead, ImportResult } from "@/lib/leads/types"

const READ_CHUNK = 300
const WRITE_CHUNK = 400 // Firestore allows 500 writes per batch

function leadIdFor(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 24)
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size))
  return out
}

export async function POST(req: Request) {
  const admin = await verifyAdmin(req)
  if (!admin) {
    return NextResponse.json(
      { error: "Sign in with an admin account to import leads." },
      { status: 401 }
    )
  }
  const db = adminDb()
  if (!db) {
    return NextResponse.json(
      { error: "The database isn't configured on the server." },
      { status: 503 }
    )
  }

  const body = (await req.json().catch(() => null)) as {
    fileName?: unknown
    rows?: unknown
  } | null
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
      const id = key ? leadIdFor(key) : db.collection("leads").doc().id
      toSave.push({ id, lead })
    }

    // Leave people who are already in Ops untouched.
    const existing = new Set<string>()
    for (const group of chunks(toSave, READ_CHUNK)) {
      const snaps = await db.getAll(
        ...group.map(({ id }) => db.collection("leads").doc(id))
      )
      for (const snap of snaps) if (snap.exists) existing.add(snap.id)
    }
    const fresh = toSave.filter(({ id }) => !existing.has(id))

    const now = FieldValue.serverTimestamp()
    for (const group of chunks(fresh, WRITE_CHUNK)) {
      const batch = db.batch()
      for (const { id, lead } of group) {
        batch.set(db.collection("leads").doc(id), {
          ...lead,
          status: "new",
          score: null,
          scoreReason: null,
          summary: null,
          source: { type: "csv", fileName, importId: importRef.id },
          createdBy: admin.email ?? admin.uid,
          createdAt: now,
          updatedAt: now,
          lastActivityAt: now,
        })
      }
      await batch.commit()
    }

    const result: ImportResult = {
      importId: importRef.id,
      created: fresh.length,
      alreadyInOps: existing.size,
      duplicatesInFile,
    }
    await importRef.set({
      fileName,
      rows: rows.length,
      ...result,
      createdBy: admin.email ?? admin.uid,
      createdAt: now,
    })

    return NextResponse.json(result)
  } catch (err) {
    return databaseErrorResponse(err)
  }
}
