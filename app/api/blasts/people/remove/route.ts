// POST /api/blasts/people/remove { blastId, email } → { ok }
// Takes a hand-added person off a blast. If they were already sent, they stay
// in the blast's Sent list.
import { NextResponse } from "next/server"
import { adminRoute, fail, stringField } from "@/lib/admin-route"
import { removePerson } from "@/lib/blasts/server"

export async function POST(req: Request) {
  return adminRoute(req, async ({ admin, db, body }) => {
    const blastId = stringField(body, "blastId")
    const email = stringField(body, "email")
    if (!blastId || !email) return fail("Who should be removed?")
    const r = await removePerson(db, blastId, email, admin.email ?? admin.uid)
    if (!r.ok) return fail(r.error, r.status)
    return NextResponse.json({ ok: true })
  })
}
