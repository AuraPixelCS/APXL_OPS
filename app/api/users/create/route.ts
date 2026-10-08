// POST /api/users/create { email, name, role, company, password? }
// → { user, password } where password is set only when we generated it.
// Never leaves a half-made account: if claims or the profile fail, the new
// Auth user is deleted again.
import { FieldValue } from "firebase-admin/firestore"
import { NextResponse } from "next/server"
import { adminRoute, fail } from "@/lib/admin-route"
import { claimsForRole } from "@/lib/roles"
import { generatePassword, validateNewUser } from "@/lib/users"
import { getOpsUser } from "@/lib/users-server"

export async function POST(req: Request) {
  return adminRoute(req, async ({ admin, auth, db, body }) => {
    const v = validateNewUser(body)
    if (!v.ok) return fail("Some fields need fixing.", 400, v.errors)
    const { email, name, role, company } = v.values
    const password = v.values.password || generatePassword()

    const record = await auth.createUser({ email, password, displayName: name })
    try {
      await auth.setCustomUserClaims(record.uid, claimsForRole(role))
      await db.doc(`users/${record.uid}`).set({
        email,
        name,
        role,
        company: role === "client" ? company : "",
        createdAt: FieldValue.serverTimestamp(),
        createdBy: admin.email ?? admin.uid,
      })
    } catch (err) {
      await auth.deleteUser(record.uid).catch(() => {})
      throw err
    }
    return NextResponse.json({
      user: await getOpsUser(auth, db, record.uid),
      password: v.values.password ? null : password,
    })
  })
}
