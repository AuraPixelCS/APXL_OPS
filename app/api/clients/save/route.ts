// POST /api/clients/save { id?, name, fromName, fromEmail, replyTo, footer,
//   resendKey?, removeKey? } → { id }
// Creates or updates a client. A new Resend key is checked with Resend, then
// sealed into clientSecrets/{id} (server only); the client doc keeps just its
// last 4 characters and the domains it can send from.
import { FieldValue } from "firebase-admin/firestore"
import { NextResponse } from "next/server"
import { adminRoute, fail, stringField } from "@/lib/admin-route"
import {
  canSendFrom,
  NO_RESEND,
  RESEND_KEY_RE,
  type ResendStatus,
  validateClient,
} from "@/lib/clients"
import { checkResendKey, toStatus } from "@/lib/clients-server"
import { sealSecret, secretsReady } from "@/lib/secrets"

export async function POST(req: Request) {
  return adminRoute(req, async ({ admin, db, body }) => {
    const checked = validateClient(body)
    if (!checked.ok)
      return fail(
        "Some fields need fixing.",
        400,
        checked.errors as Record<string, string>
      )
    const client = checked.client
    const id = stringField(body, "id")
    const ref = id ? db.doc(`clients/${id}`) : db.collection("clients").doc()
    const existing = id ? await ref.get() : null
    if (id && !existing?.exists)
      return fail("That client no longer exists.", 404)

    const others = await db.collection("clients").get()
    if (
      others.docs.some(
        (d) =>
          d.id !== ref.id &&
          String(d.get("name") ?? "").toLowerCase() ===
            client.name.toLowerCase()
      )
    )
      return fail("There's already a client with that name.", 400, {
        name: "There's already a client with that name.",
      })

    let resend: ResendStatus = existing?.exists
      ? toStatus(existing.get("resend"))
      : NO_RESEND
    let sealed: string | null = null
    const key = (stringField(body, "resendKey") ?? "").trim()
    if (key) {
      if (!RESEND_KEY_RE.test(key))
        return fail("That doesn't look like a Resend key.", 400, {
          resendKey: "Resend keys start with re_.",
        })
      if (!secretsReady())
        return fail(
          "Client keys can't be stored yet: run `npm run setup:secrets` in ap-ops first.",
          503
        )
      const r = await checkResendKey(key)
      if (!r.ok) return fail(r.error, 400, { resendKey: r.error })
      sealed = sealSecret(key)
      resend = {
        connected: true,
        last4: key.slice(-4),
        domains: r.domains,
        restricted: r.restricted,
        checkedAt: new Date(),
      }
    } else if (body.removeKey === true) resend = NO_RESEND

    if (
      client.fromEmail &&
      resend.connected &&
      !canSendFrom(resend, client.fromEmail)
    )
      return fail("That sender isn't on this Resend account.", 400, {
        fromEmail: `This Resend account sends from ${resend.domains.join(", ")}.`,
      })

    const by = admin.email ?? admin.uid
    await ref.set(
      {
        ...client,
        resend: {
          ...resend,
          checkedAt: resend.checkedAt ?? null,
        },
        updatedBy: by,
        updatedAt: FieldValue.serverTimestamp(),
        ...(existing?.exists
          ? {}
          : { createdBy: by, createdAt: FieldValue.serverTimestamp() }),
      },
      { merge: true }
    )
    if (sealed)
      await db.doc(`clientSecrets/${ref.id}`).set({
        resendKey: sealed,
        updatedBy: by,
        updatedAt: FieldValue.serverTimestamp(),
      })
    else if (body.removeKey === true)
      await db.doc(`clientSecrets/${ref.id}`).delete()
    return NextResponse.json({ id: ref.id })
  })
}
