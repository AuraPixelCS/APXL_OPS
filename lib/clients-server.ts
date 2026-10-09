// Server side of clients: checking a Resend key with Resend, and finding the
// Resend account a blast sends through (AuraPixel's own, or its client's).
// Server only.
import type { Firestore } from "firebase-admin/firestore"
import {
  canSendFrom,
  clientForSender,
  NO_RESEND,
  type ResendStatus,
} from "@/lib/clients"
import { openSecret, secretsReady } from "@/lib/secrets"

/** Asks Resend what a key can do: its verified domains, if it may list them. */
export async function checkResendKey(
  key: string
): Promise<
  | { ok: true; domains: string[]; restricted: boolean }
  | { ok: false; error: string }
> {
  const res = await fetch("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${key}` },
  }).catch(() => null)
  if (!res) return { ok: false, error: "Couldn’t reach Resend. Try again." }
  const body = (await res.json().catch(() => ({}))) as {
    name?: string
    data?: { name?: string; status?: string }[]
  }
  if (res.ok)
    return {
      ok: true,
      restricted: false,
      domains: (body.data ?? [])
        .filter((d) => d.status === "verified" && d.name)
        .map((d) => String(d.name).toLowerCase()),
    }
  if (body.name === "restricted_api_key")
    return { ok: true, restricted: true, domains: [] }
  return { ok: false, error: "Resend says this key isn’t valid." }
}

export function toStatus(raw: unknown): ResendStatus {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >
  const at = r.checkedAt as { toDate?: () => Date } | undefined
  return {
    connected: Boolean(r.connected),
    last4: typeof r.last4 === "string" ? r.last4 : "",
    domains: Array.isArray(r.domains) ? r.domains.map(String) : [],
    restricted: Boolean(r.restricted),
    checkedAt: at?.toDate?.() ?? null,
  }
}

export interface SendingAccount {
  key: string
  /** Whose account, for error messages; "" = AuraPixel's own. */
  who: string
}

/**
 * The Resend account a blast sends through: its client's when it's tagged
 * with one (or, untagged, the client whose Resend has the sender's domain),
 * else AuraPixel's (RESEND_API_KEY). Also checks the sender address is on one
 * of that account's domains.
 */
export async function sendingAccount(
  db: Firestore,
  tagged: string,
  fromEmail: string
): Promise<
  | { ok: true; account: SendingAccount }
  | { ok: false; error: string; status: number; field?: "fromEmail" }
> {
  let clientId = tagged
  if (!clientId) {
    const all = await db.collection("clients").get()
    clientId = clientForSender(
      all.docs.map((d) => ({ id: d.id, resend: toStatus(d.get("resend")) })),
      fromEmail
    )
  }
  if (!clientId) {
    const key = process.env.RESEND_API_KEY
    return key
      ? { ok: true, account: { key, who: "" } }
      : {
          ok: false,
          status: 503,
          error:
            "Email sending isn't set up yet. Run `npm run setup:email` in ap-ops.",
        }
  }
  const client = await db.doc(`clients/${clientId}`).get()
  if (!client.exists)
    return {
      ok: false,
      status: 400,
      error: "That client no longer exists. Pick who it sends with again.",
    }
  const name = String(client.get("name") ?? "This client")
  const status = toStatus(client.get("resend") ?? NO_RESEND)
  if (!status.connected)
    return {
      ok: false,
      status: 400,
      error: `${name} has no Resend key yet. Add it in Settings → Clients.`,
    }
  if (!secretsReady())
    return {
      ok: false,
      status: 503,
      error:
        "Client keys can't be opened: run `npm run setup:secrets` in ap-ops.",
    }
  const sealed = (await db.doc(`clientSecrets/${clientId}`).get()).get(
    "resendKey"
  )
  const key = typeof sealed === "string" ? openSecret(sealed) : null
  if (!key)
    return {
      ok: false,
      status: 400,
      error: `${name}'s Resend key can't be read. Paste it again in Settings → Clients.`,
    }
  if (!canSendFrom(status, fromEmail))
    return {
      ok: false,
      status: 400,
      field: "fromEmail",
      error: `${name}'s Resend can only send from ${status.domains.join(", ")}.`,
    }
  return { ok: true, account: { key, who: name } }
}
