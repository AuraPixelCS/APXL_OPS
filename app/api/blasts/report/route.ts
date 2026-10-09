// POST /api/blasts/report { id } → { report, notice }
// The blast's report as it stands: its list, send rounds, and what Resend says
// happened to each email. `notice` is for the admin (what's missing and why).
import { NextResponse } from "next/server"
import { adminRoute, fail, stringField } from "@/lib/admin-route"
import { loadBlastReport } from "@/lib/blasts/report-server"

export async function POST(req: Request) {
  return adminRoute(req, async ({ db, body }) => {
    const id = stringField(body, "id")
    if (!id) return fail("Which blast?")
    const loaded = await loadBlastReport(db, id)
    if (!loaded.ok) return fail(loaded.error, loaded.status)
    return NextResponse.json({ report: loaded.report, notice: loaded.notice })
  })
}
