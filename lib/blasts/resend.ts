// Sends email through Resend (server only). The key lives in RESEND_API_KEY:
// set it with `npm run setup:email`, never in settings or the database.

const API = "https://api.resend.com"
/** Resend's batch endpoint takes at most 100 emails per call. */
export const RESEND_BATCH_MAX = 100

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}

export interface OutgoingEmail {
  from: string
  to: string[]
  subject: string
  html: string
  text: string
  reply_to?: string[]
  headers?: Record<string, string>
  tags?: { name: string; value: string }[]
}

type ResendError = { statusCode?: number; name?: string; message?: string }

/** Turns Resend's error into something the admin can act on. */
export function resendErrorMessage(status: number, body: ResendError): string {
  const name = body.name ?? ""
  const msg = body.message ?? ""
  if (name === "daily_quota_exceeded")
    return "Resend's daily sending limit is used up. It resets at 8am Malaysia time (midnight UTC)."
  if (name === "monthly_quota_exceeded")
    return "Resend's monthly sending limit is used up. Upgrade the Resend plan or wait for next month."
  if (status === 429)
    return "Resend is limiting how fast we send. Try again in a minute."
  if (
    status === 401 ||
    name === "missing_api_key" ||
    name === "invalid_api_key"
  )
    return "The Resend API key isn't valid. Run `npm run setup:email` in ap-ops to set it again."
  if (/domain/i.test(msg) && /verif/i.test(msg))
    return `That sender address isn't on a domain verified in Resend. ${msg}`
  return msg || `Resend returned an error (${status}).`
}

async function post(
  path: string,
  payload: unknown,
  idempotencyKey?: string
): Promise<
  { ok: true; data: unknown } | { ok: false; error: string; status: number }
> {
  const key = process.env.RESEND_API_KEY
  if (!key)
    return {
      ok: false,
      status: 503,
      error:
        "Email sending isn't set up yet. Run `npm run setup:email` in ap-ops.",
    }
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${API}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify(payload),
    })
    const body = (await res.json().catch(() => ({}))) as ResendError & {
      data?: unknown
    }
    if (res.ok) return { ok: true, data: body }
    // Rate limit (not quota): wait once if Resend says it's short.
    const wait = Number(res.headers.get("retry-after") ?? "0")
    if (
      res.status === 429 &&
      !/quota/.test(body.name ?? "") &&
      attempt === 0 &&
      wait <= 5
    ) {
      await new Promise((r) => setTimeout(r, Math.max(1, wait) * 1000))
      continue
    }
    return {
      ok: false,
      status: res.status,
      error: resendErrorMessage(res.status, body),
    }
  }
}

/** Sends up to 100 emails; returns one Resend id per email, in order. */
export async function sendBatch(
  emails: OutgoingEmail[],
  idempotencyKey: string
): Promise<
  | { ok: true; ids: (string | null)[] }
  | { ok: false; error: string; status: number }
> {
  const r = await post("/emails/batch", emails, idempotencyKey)
  if (!r.ok) return r
  const data = (r.data as { data?: { id?: string }[] }).data ?? []
  return { ok: true, ids: emails.map((_, i) => data[i]?.id ?? null) }
}

export async function sendOne(
  email: OutgoingEmail
): Promise<
  { ok: true; id: string | null } | { ok: false; error: string; status: number }
> {
  const r = await post("/emails", email)
  if (!r.ok) return r
  return { ok: true, id: (r.data as { id?: string }).id ?? null }
}

/** "AuraPixel <hello@aurapixel.live>" */
export function fromHeader(name: string, address: string): string {
  return name ? `${name.replace(/["<>\\\r\n]/g, "")} <${address}>` : address
}
