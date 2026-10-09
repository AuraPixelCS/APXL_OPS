// POST /api/blasts/create { name, sheetIds } → { id }
// A new blast starts with the sender from Settings → Email and an empty email.
import { FieldValue } from "firebase-admin/firestore"
import { NextResponse } from "next/server"
import { adminRoute, fail } from "@/lib/admin-route"
import { defaultBlastEmail } from "@/lib/blasts/email"
import { checkBlastName, checkSheetIds } from "@/lib/blasts/server"
import { DEFAULT_SETTINGS } from "@/lib/settings"

export async function POST(req: Request) {
  return adminRoute(req, async ({ admin, db, body }) => {
    const name = checkBlastName(body.name)
    if ("error" in name) return fail(name.error, 400, { name: name.error })
    const sheets = await checkSheetIds(db, body.sheetIds)
    if ("error" in sheets)
      return fail(sheets.error, 400, { sheetIds: sheets.error })

    const saved = (await db.doc("settings/email").get()).data() ?? {}
    const sender = { ...DEFAULT_SETTINGS.email, ...saved }
    const by = admin.email ?? admin.uid
    const ref = db.collection("blasts").doc()
    await ref.set({
      name: name.name,
      sheetIds: sheets.sheetIds,
      email: defaultBlastEmail(sender),
      sentCount: 0,
      lastSentAt: null,
      createdBy: by,
      createdAt: FieldValue.serverTimestamp(),
      updatedBy: by,
      updatedAt: FieldValue.serverTimestamp(),
    })
    return NextResponse.json({ id: ref.id })
  })
}
