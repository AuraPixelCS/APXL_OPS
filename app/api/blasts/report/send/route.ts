// POST /api/blasts/report/send { id, to, note?, attachList?, copyMe? } → { to }
// Emails the client the blast's report, from AuraPixel's own Resend account and
// sender (Settings → Email), whoever the blast itself sent with. The numbers
// are worked out again here, so what's sent is current. Replies go to the
// admin who sent it; `copyMe` also sends them a copy.
import { FieldValue } from "firebase-admin/firestore"
import { NextResponse } from "next/server"
import { adminRoute, fail, stringField } from "@/lib/admin-route"
import {
  parseReportTo,
  REPORT_NOTE_MAX,
  renderReport,
  reportCsv,
} from "@/lib/blasts/report"
import { loadBlastReport } from "@/lib/blasts/report-server"
import { fromHeader, sendOne } from "@/lib/blasts/resend"
import { reportLogoUrl } from "@/lib/blasts/urls"
import { DEFAULT_SETTINGS } from "@/lib/settings"

export async function POST(req: Request) {
  return adminRoute(req, async ({ admin, db, body }) => {
    const id = stringField(body, "id")
    if (!id) return fail("Which blast?")
    const to = parseReportTo(body.to)
    if (!to.ok) return fail(to.error, 400, { to: to.error })
    const note = (stringField(body, "note") ?? "").trim()
    if (note.length > REPORT_NOTE_MAX)
      return fail("The note is too long.", 400, {
        note: `Keep it under ${REPORT_NOTE_MAX.toLocaleString()} characters.`,
      })
    const key = process.env.RESEND_API_KEY
    if (!key)
      return fail(
        "Email sending isn't set up yet. Run `npm run setup:email` in ap-ops.",
        503
      )

    const loaded = await loadBlastReport(db, id)
    if (!loaded.ok) return fail(loaded.error, loaded.status)
    const saved = (await db.doc("settings/email").get()).data() ?? {}
    const sender = { ...DEFAULT_SETTINGS.email, ...saved }
    const r = renderReport(loaded.report, {
      note,
      logoSrc: reportLogoUrl(),
      signature: String(sender.signature ?? ""),
    })
    const me = (admin.email ?? "").toLowerCase()
    const slug =
      loaded.report.blastName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "blast"
    const sent = await sendOne(
      { key, who: "" },
      {
        from: fromHeader(String(sender.senderName), String(sender.address)),
        to: to.to,
        ...(body.copyMe === true && me && !to.to.includes(me)
          ? { bcc: [me] }
          : {}),
        ...(me ? { reply_to: [me] } : {}),
        subject: r.subject,
        html: r.html,
        text: r.text,
        ...(body.attachList === true
          ? {
              attachments: [
                {
                  filename: `${slug}-people.csv`,
                  content_type: "text/csv",
                  content: Buffer.from(reportCsv(loaded.rows)).toString(
                    "base64"
                  ),
                },
              ],
            }
          : {}),
        tags: [
          { name: "blast", value: id },
          { name: "kind", value: "report" },
        ],
      }
    )
    if (!sent.ok) return fail(sent.error, sent.status === 503 ? 503 : 400)

    await db.doc(`blasts/${id}`).update({
      lastReport: {
        to: to.to,
        sentAt: FieldValue.serverTimestamp(),
        by: me || admin.uid,
      },
    })
    return NextResponse.json({ to: to.to })
  })
}
