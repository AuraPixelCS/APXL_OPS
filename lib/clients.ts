// Clients AuraPixel sends email for (Settings → Clients): their sender details
// and whether their own Resend account is connected. A blast tagged with a
// client sends through that client's Resend. The key itself is never in here:
// it's sealed in clientSecrets/{id}, which only the server reads. Pure.

export interface ResendStatus {
  connected: boolean
  /** Last 4 characters, so admins can tell keys apart. */
  last4: string
  /** Verified sending domains, as Resend reported them. */
  domains: string[]
  /** A sending-only key can't list domains, so `domains` is unknown. */
  restricted: boolean
  checkedAt: Date | null
}

export interface ClientDetails {
  name: string
  fromName: string
  fromEmail: string
  replyTo: string
  footer: string
}

export interface ClientProfile extends ClientDetails {
  id: string
  resend: ResendStatus
  updatedAt: Date | null
  updatedBy: string | null
}

export type ClientField = keyof ClientDetails | "resendKey"

export const CLIENT_NAME_MAX = 80
export const CLIENT_FOOTER_MAX = 600
export const RESEND_KEY_RE = /^re_[A-Za-z0-9_]{8,200}$/

export const NO_RESEND: ResendStatus = {
  connected: false,
  last4: "",
  domains: [],
  restricted: false,
  checkedAt: null,
}

const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i

export function validateClient(
  input: unknown
):
  | { ok: true; client: ClientDetails }
  | { ok: false; errors: Partial<Record<ClientField, string>> } {
  const src = (input && typeof input === "object" ? input : {}) as Record<
    string,
    unknown
  >
  const str = (k: keyof ClientDetails) =>
    typeof src[k] === "string" ? (src[k] as string) : ""
  const client: ClientDetails = {
    name: str("name").trim().replace(/\s+/g, " "),
    fromName: str("fromName").trim().replace(/\s+/g, " "),
    fromEmail: str("fromEmail").trim().toLowerCase(),
    replyTo: str("replyTo").trim().toLowerCase(),
    footer: str("footer").replace(/\r\n?/g, "\n").trim(),
  }
  const e: Partial<Record<ClientField, string>> = {}
  if (!client.name) e.name = "Give the client a name."
  else if (client.name.length > CLIENT_NAME_MAX)
    e.name = `Keep it under ${CLIENT_NAME_MAX} characters.`
  if (/["<>\\]/.test(client.fromName))
    e.fromName = "Leave out quotes and angle brackets."
  else if (client.fromName.length > CLIENT_NAME_MAX)
    e.fromName = `Keep it under ${CLIENT_NAME_MAX} characters.`
  if (client.fromEmail && !EMAIL_RE.test(client.fromEmail))
    e.fromEmail = "Enter a full email address."
  if (client.replyTo && !EMAIL_RE.test(client.replyTo))
    e.replyTo = "Enter a full email address, or leave it empty."
  if (client.footer.length > CLIENT_FOOTER_MAX)
    e.footer = `Keep it under ${CLIENT_FOOTER_MAX} characters.`
  return Object.keys(e).length ? { ok: false, errors: e } : { ok: true, client }
}

export function domainOf(email: string): string {
  return email.trim().toLowerCase().split("@")[1] ?? ""
}

/**
 * The client whose Resend has the sender's domain verified, or "". A domain
 * can be verified in only one Resend account, so an info@thinktx.my sender can
 * only ever go out through ThinkTx's: an untagged blast uses it automatically.
 */
export function clientForSender(
  clients: Pick<ClientProfile, "id" | "resend">[],
  fromEmail: string
): string {
  const domain = domainOf(fromEmail)
  const hits = domain
    ? clients.filter(
        (c) => c.resend.connected && c.resend.domains.includes(domain)
      )
    : []
  return hits.length === 1 ? hits[0].id : ""
}

/** Whether this Resend account can send as `email` (true when we can't tell).
 * Resend verifies every subdomain on its own, so it's an exact match. */
export function canSendFrom(status: ResendStatus, email: string): boolean {
  if (status.restricted || !status.domains.length) return true
  return status.domains.includes(domainOf(email))
}
