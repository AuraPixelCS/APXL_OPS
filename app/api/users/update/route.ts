// POST /api/users/update { uid, name?, role?, company?, disabled? } → { user }
// Role changes and suspensions sign the person out everywhere at once.
import { FieldValue } from "firebase-admin/firestore"
import { NextResponse } from "next/server"
import { adminRoute, fail, stringField } from "@/lib/admin-route"
import { type AppRole, claimsForRole } from "@/lib/roles"
import { getOpsUser, wouldRemoveLastAdmin } from "@/lib/users-server"

export async function POST(req: Request) {
  return adminRoute(req, async ({ admin, auth, db, body }) => {
    const uid = stringField(body, "uid")
    if (!uid) return fail("Which account?")
    const target = await getOpsUser(auth, db, uid)
    const isSelf = uid === admin.uid

    const name = stringField(body, "name")?.trim()
    const company = stringField(body, "company")?.trim()
    const role: AppRole | undefined =
      body.role === "admin" || body.role === "client" ? body.role : undefined
    const disabled =
      typeof body.disabled === "boolean" ? body.disabled : undefined

    const fields: Record<string, string> = {}
    if (name !== undefined && !name) fields.name = "Enter their name."
    if (name && name.length > 80) fields.name = "Keep it under 80 characters."
    if (company && company.length > 120)
      fields.company = "Keep it under 120 characters."
    const finalRole = role ?? target.role
    if (finalRole === "client" && !(company ?? target.company))
      fields.company = "Enter the client's business name."
    if (Object.keys(fields).length)
      return fail("Some fields need fixing.", 400, fields)

    const roleChanges = role !== undefined && role !== target.role
    if (isSelf && roleChanges)
      return fail("You can't change your own role. Ask another admin.")
    if (isSelf && disabled === true)
      return fail("You can't suspend your own account.")
    const losesAdmin =
      target.role === "admin" &&
      ((roleChanges && role !== "admin") || disabled === true)
    if (losesAdmin && (await wouldRemoveLastAdmin(auth, target))) {
      return fail(
        "Ops needs at least one active admin. Add another admin first."
      )
    }

    await auth.updateUser(uid, {
      ...(name !== undefined && { displayName: name }),
      ...(disabled !== undefined && { disabled }),
    })
    if (roleChanges && role)
      await auth.setCustomUserClaims(uid, claimsForRole(role))
    if (roleChanges || disabled === true) await auth.revokeRefreshTokens(uid)

    await db.doc(`users/${uid}`).set(
      {
        email: target.email,
        ...(name !== undefined && { name }),
        ...(roleChanges && role && { role }),
        ...(company !== undefined && {
          company: finalRole === "client" ? company : "",
        }),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: admin.email ?? admin.uid,
      },
      { merge: true }
    )
    return NextResponse.json({ user: await getOpsUser(auth, db, uid) })
  })
}
