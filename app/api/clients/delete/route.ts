// POST /api/clients/delete { id } → { ok }
// Deletes a client and its sealed Resend key. Refused while a blast still
// sends with it.
import { NextResponse } from "next/server"
import { adminRoute, fail, stringField } from "@/lib/admin-route"

export async function POST(req: Request) {
  return adminRoute(req, async ({ db, body }) => {
    const id = stringField(body, "id")
    if (!id) return fail("Which client?")
    const ref = db.doc(`clients/${id}`)
    if (!(await ref.get()).exists)
      return fail("That client no longer exists.", 404)
    const using = await db
      .collection("blasts")
      .where("email.clientId", "==", id)
      .get()
    if (!using.empty)
      return fail(
        `${using.size} ${using.size === 1 ? "blast sends" : "blasts send"} with this client (${using.docs
          .map((d) => d.get("name"))
          .slice(0, 3)
          .join(
            ", "
          )}). Switch ${using.size === 1 ? "it" : "them"} to AuraPixel first.`,
        409
      )
    await db.doc(`clientSecrets/${id}`).delete()
    await ref.delete()
    return NextResponse.json({ ok: true })
  })
}
