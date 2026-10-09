// POST /api/blasts/people/add { blastId, email, name? } → { email, unsubscribed }
// Adds one person to a blast by hand, without a file. They're kept with the
// blast (its "Added by hand" list), never in Leads.
import { NextResponse } from "next/server"
import { adminRoute, fail, stringField } from "@/lib/admin-route"
import { addPerson } from "@/lib/blasts/server"

export async function POST(req: Request) {
  return adminRoute(req, async ({ admin, db, body }) => {
    const blastId = stringField(body, "blastId")
    if (!blastId) return fail("Which blast?")
    const r = await addPerson(
      db,
      blastId,
      {
        email: (stringField(body, "email") ?? "").trim(),
        name: (stringField(body, "name") ?? "").trim().slice(0, 120),
      },
      admin.email ?? admin.uid
    )
    if (!r.ok)
      return fail(
        r.error,
        r.status,
        r.field ? { [r.field]: r.error } : undefined
      )
    return NextResponse.json({ email: r.email, unsubscribed: r.unsubscribed })
  })
}
