// POST /api/sheets/delete { id } → { deletedLeads, keptLeads }
// Removes a sheet. Leads that only came from this sheet are deleted; leads that
// also appear in another sheet stay, listed under their other sheets.
import { FieldValue } from "firebase-admin/firestore"
import { NextResponse } from "next/server"
import { adminRoute, fail, stringField } from "@/lib/admin-route"

const WRITE_CHUNK = 400

export async function POST(req: Request) {
  return adminRoute(req, async ({ db, body }) => {
    const id = stringField(body, "id")
    if (!id) return fail("Which sheet?")
    const sheet = db.collection("imports").doc(id)
    if (!(await sheet.get()).exists)
      return fail("That sheet no longer exists.", 404)

    const leads = await db
      .collection("leads")
      .where("sheetIds", "array-contains", id)
      .get()
    let deletedLeads = 0
    let keptLeads = 0
    for (let i = 0; i < leads.docs.length; i += WRITE_CHUNK) {
      const batch = db.batch()
      for (const doc of leads.docs.slice(i, i + WRITE_CHUNK)) {
        const others = ((doc.get("sheetIds") as string[]) ?? []).filter(
          (s) => s !== id
        )
        if (others.length) {
          batch.update(doc.ref, {
            sheetIds: FieldValue.arrayRemove(id),
            updatedAt: FieldValue.serverTimestamp(),
          })
          keptLeads++
        } else {
          batch.delete(doc.ref)
          deletedLeads++
        }
      }
      await batch.commit()
    }
    await sheet.delete()
    return NextResponse.json({ deletedLeads, keptLeads })
  })
}
