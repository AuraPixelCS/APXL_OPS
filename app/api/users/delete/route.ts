// POST /api/users/delete { uid } → { ok }
// Removes the login and its profile. Can't delete yourself or the last admin.
import { NextResponse } from "next/server"
import { adminRoute, fail, stringField } from "@/lib/admin-route"
import { getOpsUser, wouldRemoveLastAdmin } from "@/lib/users-server"

export async function POST(req: Request) {
  return adminRoute(req, async ({ admin, auth, db, body }) => {
    const uid = stringField(body, "uid")
    if (!uid) return fail("Which account?")
    if (uid === admin.uid) return fail("You can't delete your own account.")
    const target = await getOpsUser(auth, db, uid)
    if (await wouldRemoveLastAdmin(auth, target)) {
      return fail(
        "Ops needs at least one active admin. Add another admin first."
      )
    }
    await auth.deleteUser(uid)
    await db.doc(`users/${uid}`).delete()
    return NextResponse.json({ ok: true })
  })
}
