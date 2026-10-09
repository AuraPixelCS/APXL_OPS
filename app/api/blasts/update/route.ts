// POST /api/blasts/update { id, name?, sheetIds?, email? } → { ok }
// Saves a draft: the email only has to be well-formed here; a send checks it's
// complete.
import { FieldValue } from "firebase-admin/firestore"
import { NextResponse } from "next/server"
import { adminRoute, fail, stringField } from "@/lib/admin-route"
import { validateBlastEmail } from "@/lib/blasts/email"
import { checkBlastName, checkSheetIds } from "@/lib/blasts/server"

export async function POST(req: Request) {
  return adminRoute(req, async ({ admin, db, body }) => {
    const id = stringField(body, "id")
    if (!id) return fail("Which blast?")
    const ref = db.doc(`blasts/${id}`)
    if (!(await ref.get()).exists)
      return fail("That blast no longer exists.", 404)

    const update: Record<string, unknown> = {}
    if (body.name !== undefined) {
      const name = checkBlastName(body.name)
      if ("error" in name) return fail(name.error, 400, { name: name.error })
      update.name = name.name
    }
    if (body.sheetIds !== undefined) {
      // No sheets is fine while the blast has an uploaded file.
      const lists = ((await ref.get()).get("listIds") as string[]) ?? []
      const sheets = await checkSheetIds(db, body.sheetIds, {
        allowNone: lists.length > 0,
      })
      if ("error" in sheets)
        return fail(sheets.error, 400, { sheetIds: sheets.error })
      update.sheetIds = sheets.sheetIds
    }
    if (body.email !== undefined) {
      const checked = validateBlastEmail(body.email)
      if (!checked.ok)
        return fail(
          "Some fields need fixing.",
          400,
          checked.errors as Record<string, string>
        )
      if (
        checked.email.clientId &&
        !(await db.doc(`clients/${checked.email.clientId}`).get()).exists
      )
        return fail("That client no longer exists.", 400, {
          clientId: "Pick who it sends with again.",
        })
      update.email = checked.email
    }
    if (!Object.keys(update).length) return fail("Nothing to save.")
    await ref.update({
      ...update,
      updatedBy: admin.email ?? admin.uid,
      updatedAt: FieldValue.serverTimestamp(),
    })
    return NextResponse.json({ ok: true })
  })
}
