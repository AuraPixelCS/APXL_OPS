// Gathers a blast's report: its list and send records from Firestore, and
// what happened to each email from the Resend account it went out through.
// Server only.
import type {
  DocumentReference,
  DocumentSnapshot,
  Firestore,
} from "firebase-admin/firestore"
import {
  type BlastReport,
  buildReport,
  parseResendTime,
  type ReportRow,
} from "@/lib/blasts/report"
import { loadAudience } from "@/lib/blasts/server"
import type { RecipientStatus } from "@/lib/blasts/types"
import { clientForSender, domainOf } from "@/lib/clients"
import {
  type SendingAccount,
  sendingAccount,
  toStatus,
} from "@/lib/clients-server"

const API = "https://api.resend.com"
/** Resend's list endpoint pages at most 100. */
const PAGE = 100
/** Stop paging after this many pages or this long, whichever comes first. */
const MAX_PAGES = 100
const MAX_MS = 20_000

type Got =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number; name: string }

async function resendGet(key: string, path: string): Promise<Got> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${key}` },
    }).catch(() => null)
    if (!res) return { ok: false, status: 0, name: "unreachable" }
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (res.ok) return { ok: true, body }
    const wait = Number(res.headers.get("retry-after") ?? "1")
    if (res.status === 429 && attempt < 2 && wait <= 5) {
      await new Promise((r) => setTimeout(r, Math.max(1, wait) * 1000))
      continue
    }
    return { ok: false, status: res.status, name: String(body.name ?? "") }
  }
}

/**
 * Resend's last event for each of `ids`, read from the account's list of sent
 * emails (newest first) back to `since`. "restricted" = a sending-only key,
 * which can't read what it sent.
 */
export async function lastEvents(
  account: SendingAccount,
  ids: string[],
  since: Date | null
): Promise<
  { ok: true; events: Map<string, string> } | { ok: false; reason: string }
> {
  const wanted = new Set(ids)
  const events = new Map<string, string>()
  const started = Date.now()
  const floor = since ? since.getTime() - 10 * 60_000 : 0
  let after = ""
  for (let page = 0; page < MAX_PAGES && wanted.size; page++) {
    const got = await resendGet(
      account.key,
      `/emails?limit=${PAGE}${after ? `&after=${encodeURIComponent(after)}` : ""}`
    )
    if (!got.ok) {
      if (events.size) break
      return {
        ok: false,
        reason: got.name === "restricted_api_key" ? "restricted" : "error",
      }
    }
    const data = Array.isArray(got.body.data)
      ? (got.body.data as Record<string, unknown>[])
      : []
    for (const e of data) {
      const id = String(e.id ?? "")
      if (wanted.has(id)) {
        events.set(id, String(e.last_event ?? ""))
        wanted.delete(id)
      }
    }
    const last = data.at(-1)
    if (!last || !got.body.has_more) break
    const oldest = parseResendTime(last.created_at)?.getTime() ?? 0
    if (oldest && oldest < floor) break
    if (Date.now() - started > MAX_MS) break
    after = String(last.id ?? "")
  }
  return { ok: true, events }
}

/** Whether `domain` tracks opens and clicks in this Resend account. */
export async function domainTracking(
  account: SendingAccount,
  domain: string
): Promise<{ opens: boolean; clicks: boolean }> {
  const got = await resendGet(account.key, "/domains")
  const list = got.ok && Array.isArray(got.body.data) ? got.body.data : []
  const d = (list as Record<string, unknown>[]).find(
    (x) => String(x.name ?? "").toLowerCase() === domain
  )
  return {
    opens: Boolean(d?.open_tracking),
    clicks: Boolean(d?.click_tracking),
  }
}

async function getAll(db: Firestore, refs: DocumentReference[]) {
  const out: DocumentSnapshot[] = []
  for (let i = 0; i < refs.length; i += 300)
    out.push(...(await db.getAll(...refs.slice(i, i + 300))))
  return out
}

const str = (v: unknown) => (typeof v === "string" ? v : "")
const dateOf = (v: unknown) =>
  (v as { toDate?: () => Date } | null)?.toDate?.() ?? null

export type LoadedReport =
  | { ok: false; status: number; error: string }
  | {
      ok: true
      report: BlastReport
      rows: ReportRow[]
      /** For the admin only (never in the report): what's missing and why. */
      notice: string | null
    }

export async function loadBlastReport(
  db: Firestore,
  blastId: string
): Promise<LoadedReport> {
  const snap = await db.doc(`blasts/${blastId}`).get()
  if (!snap.exists)
    return { ok: false, status: 404, error: "That blast no longer exists." }
  const email = (snap.get("email") ?? {}) as Record<string, unknown>
  const fromEmail = str(email.fromEmail).toLowerCase()
  const tagged = str(email.clientId)

  const [audience, recSnap, clientsSnap] = await Promise.all([
    loadAudience(
      db,
      (snap.get("sheetIds") as string[]) ?? [],
      (snap.get("listIds") as string[]) ?? []
    ),
    db.collection(`blasts/${blastId}/recipients`).get(),
    db.collection("clients").get(),
  ])
  const recipients = recSnap.docs.map((d) => ({
    email: str(d.get("email")) || d.id,
    name: str(d.get("name")),
    status: (str(d.get("status")) || "failed") as RecipientStatus,
    sentAt: dateOf(d.get("sentAt")),
    resendId: str(d.get("resendId")) || null,
    unsubscribedAt: dateOf(d.get("unsubscribedAt")),
  }))
  const everyone = [
    ...new Set([...audience.keys(), ...recipients.map((r) => r.email)]),
  ]
  const unsubs = await getAll(
    db,
    everyone.map((e) => db.doc(`unsubscribes/${e}`))
  )
  const unsubscribed = new Set(everyone.filter((_, i) => unsubs[i].exists))

  const clientId =
    tagged ||
    clientForSender(
      clientsSnap.docs.map((d) => ({
        id: d.id,
        resend: toStatus(d.get("resend")),
      })),
      fromEmail
    )
  const client = str(
    clientsSnap.docs.find((d) => d.id === clientId)?.get("name")
  )

  const sent = recipients.filter((r) => r.status === "sent")
  let events: Map<string, string> | null = null
  let tracking = { opens: false, clicks: false }
  let notice: string | null = null
  if (sent.length) {
    const acct = await sendingAccount(db, tagged, fromEmail)
    if (!acct.ok)
      notice = `Delivery details aren't in the report: ${acct.error}`
    else {
      const since = sent.reduce<Date | null>(
        (min, r) => (r.sentAt && (!min || r.sentAt < min) ? r.sentAt : min),
        null
      )
      const [got, track] = await Promise.all([
        lastEvents(
          acct.account,
          sent.flatMap((r) => (r.resendId ? [r.resendId] : [])),
          since
        ),
        domainTracking(acct.account, domainOf(fromEmail)),
      ])
      tracking = track
      if (got.ok) events = got.events
      else
        notice =
          got.reason === "restricted"
            ? `${acct.account.who || "AuraPixel"}'s Resend key can only send, so delivered and bounced aren't in the report.`
            : "Resend didn't answer, so delivered and bounced aren't in the report. Try again in a minute."
      const untracked =
        !track.opens && !track.clicks
          ? "Opens and clicks"
          : !track.opens
            ? "Opens"
            : !track.clicks
              ? "Clicks"
              : ""
      if (events && untracked)
        notice = `${untracked} aren't tracked on ${domainOf(fromEmail)}.`
    }
  }

  const { report, rows } = buildReport({
    blastName: str(snap.get("name")) || "Email blast",
    campaign: str(email.subject).replaceAll("{name}", "[first name]").trim(),
    client,
    fromName: str(email.fromName),
    fromEmail,
    audience: [...audience.values()].map((a) => ({
      email: a.email,
      name: a.name === "there" ? "" : a.name,
    })),
    recipients,
    unsubscribed,
    events,
    tracking,
    now: new Date(),
  })
  return { ok: true, report, rows, notice }
}
