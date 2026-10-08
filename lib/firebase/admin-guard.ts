// Server only: confirm a request comes from a signed-in ADMIN. Reads the Bearer
// ID token, verifies it with the Admin SDK (including revocation, so a removed
// or suspended admin is cut off at once, not when their token expires), and
// requires the admin role. Every /api/* handler that reads or changes data
// gates on this.
//
// Returns the decoded token, or the Response to send back: 401 with
// `deniedMessage` when the token is missing, bad, expired or not an admin's,
// 503 when the server itself can't reach Google (checking revocation needs it),
// so a server problem never shows up as "sign in again".

import type { DecodedIdToken } from "firebase-admin/auth"
import { NextResponse } from "next/server"
import { roleFromClaims } from "@/lib/roles"
import { databaseErrorResponse } from "@/lib/server-errors"
import { adminAuth } from "./admin"

export async function verifyAdmin(
  req: Request,
  deniedMessage = "Sign in with an admin account to do this."
): Promise<DecodedIdToken | Response> {
  const denied = NextResponse.json({ error: deniedMessage }, { status: 401 })
  const match = (req.headers.get("authorization") ?? "").match(/^Bearer (.+)$/i)
  if (!match) return denied
  const auth = adminAuth()
  if (!auth)
    return NextResponse.json(
      { error: "The database isn't configured on the server." },
      { status: 503 }
    )
  try {
    const decoded = await auth.verifyIdToken(match[1], true)
    return roleFromClaims(decoded) === "admin" ? decoded : denied
  } catch (err) {
    // auth/* = the token's problem (expired, revoked, disabled, malformed).
    // Anything else (app/invalid-credential, network) is the server's.
    const code = (err as { code?: unknown }).code
    if (typeof code === "string" && code.startsWith("auth/")) return denied
    return databaseErrorResponse(err)
  }
}
