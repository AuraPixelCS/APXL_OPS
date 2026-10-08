// Server only: confirm a request comes from a signed-in ADMIN. Reads the Bearer
// ID token, verifies it with the Admin SDK (including revocation, so a removed
// or suspended admin is cut off at once, not when their token expires), and
// requires the admin role. Every /api/* handler that reads or changes data
// gates on this.

import type { DecodedIdToken } from "firebase-admin/auth"
import { roleFromClaims } from "@/lib/roles"
import { adminAuth } from "./admin"

export async function verifyAdmin(
  req: Request
): Promise<DecodedIdToken | null> {
  const match = (req.headers.get("authorization") ?? "").match(/^Bearer (.+)$/i)
  if (!match) return null
  const auth = adminAuth()
  if (!auth) return null
  try {
    const decoded = await auth.verifyIdToken(match[1], true)
    return roleFromClaims(decoded) === "admin" ? decoded : null
  } catch {
    return null
  }
}
