// POST /api/blasts/delete { id } → { ok }
// Removes the blast, its send history and its banner images. Unsubscribes stay:
// they apply to every blast.
import { NextResponse } from "next/server"
import { adminRoute, fail, stringField } from "@/lib/admin-route"

export async function POST(req: Request) {
  return adminRoute(req, async ({ db, body }) => {
    const id = stringField(body, "id")
    if (!id) return fail("Which blast?")
    const ref = db.doc(`blasts/${id}`)
    if (!(await ref.get()).exists)
      return fail("That blast no longer exists.", 404)
    const assets = await db
      .collection("blastAssets")
      .where("blastId", "==", id)
      .get()
    await Promise.all(assets.docs.map((d) => d.ref.delete()))
    await db.recursiveDelete(ref)
    return NextResponse.json({ ok: true })
  })
}
