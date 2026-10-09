// POST /api/blasts/lists/add { blastId, list: { fileName, tabName, name, rows } }
//   → { listId, people, canEmail, repeated }
// Adds people from a file to one blast only (they don't go into Leads).
import { FieldValue } from "firebase-admin/firestore"
import { NextResponse } from "next/server"
import { adminRoute, fail, stringField } from "@/lib/admin-route"
import { checkUploadedList, saveBlastList } from "@/lib/blasts/server"
import { MAX_BLAST_LISTS } from "@/lib/blasts/types"

export async function POST(req: Request) {
  return adminRoute(req, async ({ admin, db, body }) => {
    const blastId = stringField(body, "blastId")
    const ref = db.doc(`blasts/${blastId ?? "-"}`)
    const snap = blastId ? await ref.get() : null
    if (!snap?.exists) return fail("That blast no longer exists.", 404)
    if (((snap.get("listIds") as string[]) ?? []).length >= MAX_BLAST_LISTS)
      return fail(`A blast can have at most ${MAX_BLAST_LISTS} uploaded files.`)
    const list = checkUploadedList(body.list)
    if ("error" in list) return fail(list.error, 400, { list: list.error })
    const by = admin.email ?? admin.uid
    const r = await saveBlastList(db, ref.id, list, by)
    await ref.update({
      listIds: FieldValue.arrayUnion(r.listId),
      updatedBy: by,
      updatedAt: FieldValue.serverTimestamp(),
    })
    return NextResponse.json(r)
  })
}
