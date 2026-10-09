// POST /api/blasts/send { id, emails: string[] } → { sent, failed, skipped, error }
//
// Sends the blast's SAVED email to the chosen addresses, in Resend batches of
// 100. Only addresses in the blast's sheets are sent to. Anyone already sent,
// mid-send or unsubscribed is skipped, so a double click or a retry never
// emails someone twice. Each recipient is claimed ("sending") before the call
// and marked sent/failed after. If Resend refuses the whole batch for an
// account reason (daily limit, bad key, unverified domain) those people go back
// to how they were, so they show as not sent rather than failed.
import { randomBytes } from "node:crypto"
import {
  type DocumentReference,
  type DocumentSnapshot,
  FieldValue,
  type Firestore,
} from "firebase-admin/firestore"
import { NextResponse } from "next/server"
import { adminRoute, fail, stringField } from "@/lib/admin-route"
import {
  emailDocId,
  renderBlastEmail,
  validateBlastEmail,
} from "@/lib/blasts/email"
import {
  fromHeader,
  type OutgoingEmail,
  RESEND_BATCH_MAX,
  sendBatch,
} from "@/lib/blasts/resend"
import { type AudienceMember, loadAudience } from "@/lib/blasts/server"
import { MAX_SEND_PER_REQUEST } from "@/lib/blasts/types"
import {
  bannerUrl,
  oneClickUnsubscribeUrl,
  unsubscribePageUrl,
} from "@/lib/blasts/urls"

/** A "sending" claim older than this is treated as abandoned. */
const STALE_CLAIM_MS = 10 * 60_000
/** Resend refused for a reason that isn't about the recipients. */
const ACCOUNT_LEVEL = new Set([401, 403, 429, 503])

async function getAll(db: Firestore, refs: DocumentReference[]) {
  const out: DocumentSnapshot[] = []
  for (let i = 0; i < refs.length; i += 300)
    out.push(...(await db.getAll(...refs.slice(i, i + 300))))
  return out
}

type Claim = {
  member: AudienceMember
  ref: DocumentReference
  token: string
  /** The doc before we claimed it, to put back if Resend refuses the batch. */
  before: Record<string, unknown> | null
}

export async function POST(req: Request) {
  return adminRoute(req, async ({ admin, db, body }) => {
    const id = stringField(body, "id")
    if (!id) return fail("Which blast?")
    const blastSnap = await db.doc(`blasts/${id}`).get()
    if (!blastSnap.exists) return fail("That blast no longer exists.", 404)
    const checked = validateBlastEmail(blastSnap.get("email"), {
      sending: true,
    })
    if (!checked.ok)
      return fail(
        "Finish the email first: open the Email tab and fill in the highlighted fields.",
        400,
        checked.errors as Record<string, string>
      )
    const email = checked.email

    const requested = [
      ...new Set(
        (Array.isArray(body.emails) ? body.emails : [])
          .filter((e): e is string => typeof e === "string")
          .map(emailDocId)
      ),
    ]
    if (!requested.length) return fail("Pick who to send to.")
    if (requested.length > MAX_SEND_PER_REQUEST)
      return fail(`Send to at most ${MAX_SEND_PER_REQUEST} people at a time.`)

    const audience = await loadAudience(
      db,
      (blastSnap.get("sheetIds") as string[]) ?? [],
      (blastSnap.get("listIds") as string[]) ?? []
    )
    const inBlast = requested.filter((e) => audience.has(e))
    const skipped = {
      notInBlast: requested.length - inBlast.length,
      alreadySent: 0,
      unsubscribed: 0,
      inProgress: 0,
    }
    const recRefs = inBlast.map((e) => db.doc(`blasts/${id}/recipients/${e}`))
    const [recs, unsubs] = await Promise.all([
      getAll(db, recRefs),
      getAll(
        db,
        inBlast.map((e) => db.doc(`unsubscribes/${e}`))
      ),
    ])

    const claims: Claim[] = []
    inBlast.forEach((e, i) => {
      if (unsubs[i].exists) return void skipped.unsubscribed++
      const rec = recs[i]
      const status = rec.get("status")
      if (status === "sent") return void skipped.alreadySent++
      const claimedAt = rec.get("attemptAt")?.toMillis?.() ?? 0
      if (status === "sending" && Date.now() - claimedAt < STALE_CLAIM_MS)
        return void skipped.inProgress++
      claims.push({
        member: audience.get(e)!,
        ref: recRefs[i],
        token: rec.get("token") ?? randomBytes(16).toString("base64url"),
        before: rec.exists ? (rec.data() ?? null) : null,
      })
    })
    if (!claims.length)
      return NextResponse.json({ sent: 0, failed: 0, skipped, error: null })

    for (let i = 0; i < claims.length; i += 400) {
      const batch = db.batch()
      for (const c of claims.slice(i, i + 400))
        batch.set(
          c.ref,
          {
            email: c.member.email,
            leadId: c.member.leadId,
            name: c.member.name,
            status: "sending",
            token: c.token,
            error: null,
            attemptAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
      await batch.commit()
    }

    const by = admin.email ?? admin.uid
    const from = fromHeader(email.fromName, email.fromEmail)
    const banner = bannerUrl(email.bannerId)
    const nonce = randomBytes(6).toString("hex")
    let sent = 0
    let failed = 0
    let error: string | null = null
    let stopped = false

    for (let i = 0; i < claims.length; i += RESEND_BATCH_MAX) {
      const chunk = claims.slice(i, i + RESEND_BATCH_MAX)
      const batch = db.batch()
      if (stopped) {
        for (const c of chunk) restore(batch, c)
        await batch.commit()
        continue
      }
      const outgoing: OutgoingEmail[] = chunk.map((c) => {
        const r = renderBlastEmail(email, {
          name: c.member.name,
          bannerSrc: banner,
          unsubscribeUrl: unsubscribePageUrl(id, c.member.email, c.token),
        })
        return {
          from,
          to: [c.member.email],
          subject: r.subject,
          html: r.html,
          text: r.text,
          ...(email.replyTo ? { reply_to: [email.replyTo] } : {}),
          headers: {
            "List-Unsubscribe": `<${oneClickUnsubscribeUrl(id, c.member.email, c.token)}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
          tags: [{ name: "blast", value: id }],
        }
      })
      const res = await sendBatch(outgoing, `blast-${id}-${nonce}-${i}`)
      if (res.ok) {
        chunk.forEach((c, j) =>
          batch.set(
            c.ref,
            {
              status: "sent",
              resendId: res.ids[j],
              sentAt: FieldValue.serverTimestamp(),
              sentBy: by,
              error: null,
            },
            { merge: true }
          )
        )
        sent += chunk.length
      } else {
        error ??= res.error
        if (ACCOUNT_LEVEL.has(res.status)) {
          stopped = true
          for (const c of chunk) restore(batch, c)
        } else {
          for (const c of chunk)
            batch.set(
              c.ref,
              { status: "failed", error: res.error },
              { merge: true }
            )
          failed += chunk.length
        }
      }
      await batch.commit()
    }

    if (sent)
      await blastSnap.ref.update({
        sentCount: FieldValue.increment(sent),
        lastSentAt: FieldValue.serverTimestamp(),
      })
    return NextResponse.json({
      sent,
      failed,
      notSent: claims.length - sent - failed,
      skipped,
      error,
    })
  })
}

/** Put a claimed recipient back the way it was. */
function restore(batch: FirebaseFirestore.WriteBatch, c: Claim) {
  if (c.before) batch.set(c.ref, { ...c.before, token: c.token })
  else batch.delete(c.ref)
}
