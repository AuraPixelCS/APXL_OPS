// POST /api/blasts/lists/remove { blastId, listId } → { ok }
// Removes an uploaded file and its people from a blast. Who was already sent
// stays in the blast's Sent list.
import { FieldValue } from "firebase-admin/firestore"
import { NextResponse } from "next/server"
import { adminRoute, fail, stringField } from "@/lib/admin-route"

export async function POST(req: Request) {
  return adminRoute(req, async ({ admin, db, body }) => {
    const blastId = stringField(body, "blastId")
    const listId = stringField(body, "listId")
    if (!blastId || !listId) return fail("Which file?")
    const ref = db.doc(`blasts/${blastId}`)
    const snap = await ref.get()
    if (!snap.exists) return fail("That blast no longer exists.", 404)
    const listIds = (snap.get("listIds") as string[]) ?? []
    const sheetIds = (snap.get("sheetIds") as string[]) ?? []
    if (!listIds.includes(listId))
      return fail("That file isn't in this blast.", 404)
    if (listIds.length === 1 && !sheetIds.length)
      return fail(
        "A blast needs someone to send to. Add a sheet or another file first."
      )
    const list = db.doc(`blastLists/${listId}`)
    if ((await list.get()).get("blastId") === blastId)
      await db.recursiveDelete(list)
    await ref.update({
      listIds: FieldValue.arrayRemove(listId),
      updatedBy: admin.email ?? admin.uid,
      updatedAt: FieldValue.serverTimestamp(),
    })
    return NextResponse.json({ ok: true })
  })
}
