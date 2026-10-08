// POST /api/settings   { section: "email" | "assistant" | "scoring", values }
//
// Saves one section of Ops settings to `settings/{section}` after running the
// same validation the form uses. The browser can't write Firestore directly.

import { FieldValue } from "firebase-admin/firestore"
import { NextResponse } from "next/server"
import { adminDb } from "@/lib/firebase/admin"
import { verifyAdmin } from "@/lib/firebase/admin-guard"
import { databaseErrorResponse } from "@/lib/server-errors"
import {
  SETTINGS_SECTIONS,
  type SettingsSection,
  validateSettings,
} from "@/lib/settings"

export async function POST(req: Request) {
  const admin = await verifyAdmin(
    req,
    "Sign in with an admin account to change settings."
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
    section?: unknown
    values?: unknown
  } | null
  const section = body?.section as SettingsSection
  if (!SETTINGS_SECTIONS.includes(section)) {
    return NextResponse.json(
      { error: "Unknown settings section." },
      { status: 400 }
    )
  }

  const result = validateSettings(section, body?.values)
  if (!result.ok) {
    return NextResponse.json(
      { error: "Some fields need fixing.", fields: result.errors },
      { status: 400 }
    )
  }

  try {
    await db.doc(`settings/${section}`).set({
      ...result.values,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: admin.email ?? admin.uid,
    })
  } catch (err) {
    return databaseErrorResponse(err)
  }
  return NextResponse.json({ ok: true })
}
