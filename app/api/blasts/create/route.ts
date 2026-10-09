// POST /api/blasts/create { name, sheetIds?, list? } → { id }
// Who it goes to: imported sheets, or a file uploaded just for this blast
// (`list`: { fileName, tabName, name, rows }), or both. A new blast starts with
// the sender from Settings → Email and an empty email.
import { FieldValue } from "firebase-admin/firestore"
import { NextResponse } from "next/server"
import { adminRoute, fail } from "@/lib/admin-route"
import { defaultBlastEmail } from "@/lib/blasts/email"
import {
  checkBlastName,
  checkSheetIds,
  checkUploadedList,
  saveBlastList,
} from "@/lib/blasts/server"
import { DEFAULT_SETTINGS } from "@/lib/settings"

export async function POST(req: Request) {
  return adminRoute(req, async ({ admin, db, body }) => {
    const name = checkBlastName(body.name)
    if ("error" in name) return fail(name.error, 400, { name: name.error })
    const list = body.list === undefined ? null : checkUploadedList(body.list)
    if (list && "error" in list)
      return fail(list.error, 400, { list: list.error })
    const sheets = await checkSheetIds(db, body.sheetIds, { allowNone: !!list })
    if ("error" in sheets)
      return fail(sheets.error, 400, { sheetIds: sheets.error })

    const saved = (await db.doc("settings/email").get()).data() ?? {}
    const sender = { ...DEFAULT_SETTINGS.email, ...saved }
    const by = admin.email ?? admin.uid
    const ref = db.collection("blasts").doc()
    await ref.set({
      name: name.name,
      sheetIds: sheets.sheetIds,
      listIds: [],
      email: defaultBlastEmail(sender),
      sentCount: 0,
      lastSentAt: null,
      createdBy: by,
      createdAt: FieldValue.serverTimestamp(),
      updatedBy: by,
      updatedAt: FieldValue.serverTimestamp(),
    })
    if (list) {
      const r = await saveBlastList(db, ref.id, list, by)
      await ref.update({ listIds: [r.listId] })
    }
    return NextResponse.json({ id: ref.id })
  })
}
