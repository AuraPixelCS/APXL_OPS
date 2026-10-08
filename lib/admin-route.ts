// Wraps an admin-only API route: checks the caller is a signed-in admin, hands
// over Auth + Firestore + the parsed body, and turns failures into messages
// the admin can act on. Server only.

import type { Auth, DecodedIdToken } from "firebase-admin/auth"
import type { Firestore } from "firebase-admin/firestore"
import { NextResponse } from "next/server"
import { adminAuth, adminDb } from "@/lib/firebase/admin"
import { verifyAdmin } from "@/lib/firebase/admin-guard"
import { databaseErrorResponse } from "@/lib/server-errors"
import { authErrorMessage } from "@/lib/users-server"

export interface AdminRouteContext {
  admin: DecodedIdToken
  auth: Auth
  db: Firestore
  body: Record<string, unknown>
}

export function fail(
  error: string,
  status = 400,
  fields?: Record<string, string>
) {
  return NextResponse.json(fields ? { error, fields } : { error }, { status })
}

export async function adminRoute(
  req: Request,
  handler: (ctx: AdminRouteContext) => Promise<Response>
) {
  const admin = await verifyAdmin(req)
  if (!admin) return fail("Sign in with an admin account to do this.", 401)
  const auth = adminAuth()
  const db = adminDb()
  if (!auth || !db)
    return fail("The database isn't configured on the server.", 503)
  const raw = await req.json().catch(() => ({}))
  const body =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  try {
    return await handler({ admin, auth, db, body })
  } catch (err) {
    const message = authErrorMessage(err)
    if (message) return fail(message)
    return databaseErrorResponse(err)
  }
}

export function stringField(
  body: Record<string, unknown>,
  key: string
): string | undefined {
  return typeof body[key] === "string" ? (body[key] as string) : undefined
}
