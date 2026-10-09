// POST /api/blasts/test { id, email, to? } → { to }
// Sends the email as it is on screen (saved or not) to one address, by default
// the admin's own. Subject gets "[Test]"; the unsubscribe link explains itself.
import { NextResponse } from "next/server"
import { adminRoute, fail, stringField } from "@/lib/admin-route"
import { renderBlastEmail, validateBlastEmail } from "@/lib/blasts/email"
import { fromHeader, sendOne } from "@/lib/blasts/resend"
import { bannerUrl, TEST_UNSUBSCRIBE_URL } from "@/lib/blasts/urls"
import { sendingAccount } from "@/lib/clients-server"

const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i

export async function POST(req: Request) {
  return adminRoute(req, async ({ admin, db, body }) => {
    const id = stringField(body, "id")
    if (!id || !(await db.doc(`blasts/${id}`).get()).exists)
      return fail("That blast no longer exists.", 404)
    const checked = validateBlastEmail(body.email, { sending: true })
    if (!checked.ok)
      return fail(
        "Fill in the highlighted fields first.",
        400,
        checked.errors as Record<string, string>
      )
    const email = checked.email
    const to = (stringField(body, "to") || admin.email || "")
      .trim()
      .toLowerCase()
    if (!EMAIL_RE.test(to))
      return fail("Enter an address to send the test to.", 400, {
        to: "Enter a full email address.",
      })

    const acct = await sendingAccount(db, email.clientId, email.fromEmail)
    if (!acct.ok)
      return fail(
        acct.error,
        acct.status,
        acct.field ? { [acct.field]: acct.error } : undefined
      )

    const firstName = String(admin.name ?? "").split(/\s+/)[0] ?? ""
    const r = renderBlastEmail(email, {
      name: firstName,
      bannerSrc: bannerUrl(email.bannerId),
      unsubscribeUrl: TEST_UNSUBSCRIBE_URL,
    })
    const sent = await sendOne(acct.account, {
      from: fromHeader(email.fromName, email.fromEmail),
      to: [to],
      subject: `[Test] ${r.subject}`,
      html: r.html,
      text: r.text,
      ...(email.replyTo ? { reply_to: [email.replyTo] } : {}),
      tags: [
        { name: "blast", value: id },
        { name: "kind", value: "test" },
      ],
    })
    if (!sent.ok) return fail(sent.error, sent.status === 503 ? 503 : 400)
    return NextResponse.json({ to })
  })
}
