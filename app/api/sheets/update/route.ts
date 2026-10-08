// POST /api/sheets/update { id, title } → { ok }
// Renames a sheet. The client stays fixed: duplicates are matched per client,
// so a sheet filed under the wrong client is deleted and imported again.
import { FieldValue } from "firebase-admin/firestore"
import { NextResponse } from "next/server"
import { adminRoute, fail, stringField } from "@/lib/admin-route"
import { TITLE_MAX, tidyName } from "@/lib/leads/sheets"

export async function POST(req: Request) {
  return adminRoute(req, async ({ admin, db, body }) => {
    const id = stringField(body, "id")
    if (!id) return fail("Which sheet?")
    const title = tidyName(stringField(body, "title") ?? "")
    if (!title)
      return fail("Give this sheet a title.", 400, {
        title: "Give this sheet a title.",
      })
    if (title.length > TITLE_MAX) {
      const msg = `Keep it under ${TITLE_MAX} characters.`
      return fail(msg, 400, { title: msg })
    }
    const ref = db.collection("imports").doc(id)
    if (!(await ref.get()).exists)
      return fail("That sheet no longer exists.", 404)
    await ref.update({
      title,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: admin.email ?? admin.uid,
    })
    return NextResponse.json({ ok: true })
  })
}
