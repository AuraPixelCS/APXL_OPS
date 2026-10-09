// Email blasts as stored in Firestore:
//   blasts/{id}                         name, sheets, the email, counters
//   blasts/{id}/recipients/{email}      one per address sent to (or tried)
//   blastLists/{id}                     a file uploaded just for one blast
//   blastLists/{id}/contacts/{email}    its people (never added to Leads)
//   blastAssets/{id}                    uploaded banner images (served publicly)
//   unsubscribes/{email}                people who opted out of every blast

import type { BlastEmail } from "@/lib/blasts/email"

export interface Blast {
  id: string
  name: string
  /** Sheets whose leads make up the audience (max MAX_BLAST_SHEETS). */
  sheetIds: string[]
  /** Files uploaded just for this blast (max MAX_BLAST_LISTS). */
  listIds: string[]
  email: BlastEmail
  /** Emails delivered to Resend so far (never goes down). */
  sentCount: number
  lastSentAt: Date | null
  createdBy: string | null
  createdAt: Date | null
  updatedBy: string | null
  updatedAt: Date | null
}

export type RecipientStatus = "sending" | "sent" | "failed"

export interface BlastRecipient {
  email: string
  leadId: string
  name: string
  status: RecipientStatus
  error: string | null
  sentAt: Date | null
  sentBy: string | null
  /** When the last send attempt claimed this address. */
  attemptAt: Date | null
  unsubscribedAt: Date | null
}

/** A file uploaded just for one blast. Its people don't go into Leads. */
export interface BlastList {
  id: string
  blastId: string
  name: string
  fileName: string
  people: number
  canEmail: number
  createdAt: Date | null
}

/** Firestore's array-contains-any takes at most 30 values. */
export const MAX_BLAST_SHEETS = 30
export const MAX_BLAST_LISTS = 10
/** Per click of Send; keeps one request well inside the function time limit. */
export const MAX_SEND_PER_REQUEST = 500
export const BLAST_NAME_MAX = 80
