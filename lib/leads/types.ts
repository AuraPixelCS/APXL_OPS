// Shapes shared by the browser (CSV preview, lists) and the server (import).

export type LeadFlag =
  | "name_unusable"
  | "email_missing"
  | "email_invalid"
  | "email_multiple"
  | "email_suspicious"
  | "phone_missing"
  | "phone_invalid"
  | "phone_landline"
  | "phone_foreign"

/** One lead after cleaning, before it has a place in Ops. */
export interface CleanLead {
  name: string
  /** What the intro email says after "Hi". "there" when the name looks fake. */
  greetingName: string
  email: string
  /** There is an address we can actually send to. */
  emailOk: boolean
  /** A company domain rather than Gmail/Yahoo/student mail: a weak buying signal. */
  workEmail: boolean
  /** Digits only, Malaysian numbers in 60… form. */
  phone: string
  whatsappOk: boolean
  flags: LeadFlag[]
  /** Every other non-empty CSV column, e.g. Meta form answers and ad names. */
  extra: Record<string, string>
}

/** Where each lead is in the conversation. Score (hot/warm/cold) is separate. */
export type LeadStatus = "new" | "emailed" | "replied" | "booked" | "closed"

export type LeadScore = "hot" | "warm" | "cold"

/** The first sheet this person came in on. */
export interface LeadSource {
  type: "csv"
  fileName: string
  importId: string
}

/** A lead as stored in Firestore (`leads/{id}`), with dates as JS Dates. */
export interface Lead extends CleanLead {
  id: string
  status: LeadStatus
  score: LeadScore | null
  scoreReason: string | null
  summary: string | null
  /** The client (business) these leads were collected for. */
  client: string
  clientKey: string
  /** Every sheet (import) this person appeared in, for this client. */
  sheetIds: string[]
  source: LeadSource
  createdAt: Date | null
  updatedAt: Date | null
  lastActivityAt: Date | null
}

export interface ImportResult {
  importId: string
  title: string
  client: string
  created: number
  /** Already in Ops for this client: listed under this sheet too, otherwise untouched. */
  alreadyInOps: number
  duplicatesInFile: number
}
