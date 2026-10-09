// One row per email address in a blast: its leads (from the blast's sheets),
// what's been sent (recipients), and who opted out (unsubscribes). Pure.

import { emailDocId } from "./email.ts"
import type { BlastRecipient } from "@/lib/blasts/types"
import type { Lead } from "@/lib/leads/types"

export type RowStatus =
  "not_sent" | "sending" | "sent" | "failed" | "unsubscribed" | "cant_email"

export interface RecipientRow {
  /** The address, or the lead id when there's no usable address. */
  key: string
  email: string
  name: string
  leadId: string
  sheetIds: string[]
  client: string
  status: RowStatus
  sentAt: Date | null
  error: string | null
  /** Sent earlier, but its sheet is no longer in this blast. */
  outside: boolean
}

export const STATUS_LABEL: Record<RowStatus, string> = {
  not_sent: "Not sent",
  sending: "Sending…",
  sent: "Sent",
  failed: "Failed",
  unsubscribed: "Unsubscribed",
  cant_email: "Can’t email",
}

/** Matches the server: an older "sending" claim was abandoned. */
const STALE_CLAIM_MS = 10 * 60_000

export const canSelect = (r: RecipientRow) =>
  !r.outside && (r.status === "not_sent" || r.status === "failed")

export function buildRows(
  leads: Lead[],
  recipients: Map<string, BlastRecipient>,
  unsubscribed: Set<string>,
  now = Date.now()
): RecipientRow[] {
  // Oldest first, so "the next 100" follows the order people came in.
  const sorted = [...leads].sort(
    (a, b) =>
      (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0) ||
      a.id.localeCompare(b.id)
  )
  const byEmail = new Map<string, RecipientRow>()
  const cant: RecipientRow[] = []
  for (const l of sorted) {
    if (!l.emailOk) {
      cant.push({
        key: l.id,
        email: l.email,
        name: l.name,
        leadId: l.id,
        sheetIds: l.sheetIds,
        client: l.client,
        status: "cant_email",
        sentAt: null,
        error: null,
        outside: false,
      })
      continue
    }
    const email = emailDocId(l.email)
    const row = byEmail.get(email)
    if (row) {
      row.sheetIds = [...new Set([...row.sheetIds, ...l.sheetIds])]
      continue
    }
    byEmail.set(email, {
      key: email,
      email,
      name: l.name,
      leadId: l.id,
      sheetIds: l.sheetIds,
      client: l.client,
      status: "not_sent",
      sentAt: null,
      error: null,
      outside: false,
    })
  }
  for (const [email, rec] of recipients) {
    if (byEmail.has(email) || rec.status !== "sent") continue
    byEmail.set(email, {
      key: email,
      email,
      name: rec.name,
      leadId: rec.leadId,
      sheetIds: [],
      client: "",
      status: "sent",
      sentAt: null,
      error: null,
      outside: true,
    })
  }
  for (const row of byEmail.values()) {
    const rec = recipients.get(row.key)
    if (rec) {
      row.sentAt = rec.sentAt
      row.error = rec.error
      const stale =
        rec.status === "sending" &&
        now - (rec.attemptAt?.getTime() ?? 0) > STALE_CLAIM_MS
      row.status = stale ? "not_sent" : rec.status
    }
    if (unsubscribed.has(row.key)) row.status = "unsubscribed"
  }
  return [...byEmail.values(), ...cant]
}

export function countByStatus(rows: RecipientRow[]): Record<RowStatus, number> {
  const out: Record<RowStatus, number> = {
    not_sent: 0,
    sending: 0,
    sent: 0,
    failed: 0,
    unsubscribed: 0,
    cant_email: 0,
  }
  for (const r of rows) out[r.status]++
  return out
}
