// Turns one raw CSV row (a Meta lead export, a Google Sheet, anything with a
// name / email / phone column) into a predictable CleanLead, and lists anything
// a person should look at in `flags`.
//
// Runs in BOTH places: the browser uses it for the import preview, and the
// import API re-runs it on the raw rows so what's saved never depends on what
// the browser sent. Keep it free of browser-only and Node-only imports.
// Tested by scripts/test-clean.ts (`npm test`).

import type { CleanLead, LeadFlag } from "./types"

const FREE_MAIL = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.com.my",
  "ymail.com",
  "hotmail.com",
  "hotmail.my",
  "outlook.com",
  "outlook.my",
  "live.com",
  "live.com.my",
  "live.co.uk",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
])
// Domains people type when they don't want to give a real address.
const PLACEHOLDER_MAIL = new Set(["email.com", "example.com", "test.com"])

const NAME_KEYS = ["full_name", "name", "fullname", "your_name"]
const FIRST_KEYS = ["first_name", "firstname"]
const LAST_KEYS = ["last_name", "lastname", "surname"]
const EMAIL_KEYS = ["email", "work_email", "email_address", "e_mail"]
const PHONE_KEYS = [
  "phone_number",
  "phone",
  "mobile",
  "mobile_number",
  "whatsapp",
  "work_phone_number",
]
const KNOWN_KEYS = new Set([
  ...NAME_KEYS,
  ...FIRST_KEYS,
  ...LAST_KEYS,
  ...EMAIL_KEYS,
  ...PHONE_KEYS,
])

const MAX_EXTRA_FIELDS = 40
const MAX_EXTRA_LENGTH = 500

/** A column we read a name, email or phone from (used to find the header row). */
export function isContactColumn(header: string): boolean {
  return KNOWN_KEYS.has(normalizeKey(header))
}

/** "Full Name " → "full_name", so differently written headers match. */
export function normalizeKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
}

function normalizeRow(row: Record<string, unknown>): Map<string, string> {
  const out = new Map<string, string>()
  for (const [k, v] of Object.entries(row)) {
    if (v === undefined || v === null) continue
    const value = String(v).trim()
    if (value) out.set(normalizeKey(k), value)
  }
  return out
}

function pick(row: Map<string, string>, keys: string[]): string {
  for (const k of keys) {
    const v = row.get(k)
    if (v) return v
  }
  return ""
}

function tidyName(
  raw: string,
  flags: LeadFlag[]
): { name: string; greeting: string } {
  const name = raw.replace(/\s+/g, " ").trim()
  // Digits, decoration symbols or no letters at all: "?", "d3w1", "ᴠᴇʟ•ʟʏɴᴀ".
  // Names in other scripts (Tamil, Bengali, Chinese) are real names and pass.
  const unusable =
    !name ||
    /\d/.test(name) ||
    !/\p{L}/u.test(name) ||
    /[•☆★|@#_~^*?]/.test(name)
  if (unusable) {
    flags.push("name_unusable")
    return { name: raw, greeting: "there" }
  }
  // Only re-case names typed in all-lower or ALL-CAPS; leave mixed case alone.
  const latin = /[a-z]/i.test(name)
  const oneCase = name === name.toLowerCase() || name === name.toUpperCase()
  const tidy =
    latin && oneCase
      ? name
          .toLowerCase()
          .replace(
            /(^|[\s'-])(\p{L})/gu,
            (_, sep, ch) => sep + ch.toUpperCase()
          )
      : name
  return { name: tidy, greeting: tidy }
}

function tidyEmail(
  raw: string,
  flags: LeadFlag[]
): { email: string; ok: boolean; work: boolean } {
  if (!raw) {
    flags.push("email_missing")
    return { email: "", ok: false, work: false }
  }
  const found =
    raw.toLowerCase().match(/[^\s/,;<>]+@[^\s/,;<>]+\.[a-z]{2,}/g) ?? []
  const email = found[0]
  if (!email) {
    flags.push("email_invalid")
    return { email: raw, ok: false, work: false }
  }
  if (found.length > 1) flags.push("email_multiple")
  const domain = email.slice(email.indexOf("@") + 1)
  const placeholder = PLACEHOLDER_MAIL.has(domain) || /\.com\.com$/.test(domain)
  if (placeholder) flags.push("email_suspicious")
  const work =
    !FREE_MAIL.has(domain) && !domain.endsWith(".edu.my") && !placeholder
  return { email, ok: true, work }
}

function tidyPhone(
  raw: string,
  flags: LeadFlag[]
): { phone: string; ok: boolean } {
  if (!raw) {
    flags.push("phone_missing")
    return { phone: "", ok: false }
  }
  // Meta exports prefix numbers with "p:"; people also type spaces, dashes and
  // invisible direction marks. Keep digits only.
  let phone = raw.replace(/^p:/i, "").replace(/\D/g, "")
  if (!phone) {
    flags.push("phone_invalid")
    return { phone: raw, ok: false }
  }
  if (phone.startsWith("0"))
    phone = "6" + phone // 012-345 6789 → 60123456789
  // Spreadsheets that store phones as numbers drop the leading 0: 123456789.
  else if (/^1\d{8,9}$/.test(phone) && !raw.trim().startsWith("+"))
    phone = "60" + phone
  if (phone.startsWith("60")) {
    if (/^601\d{8,9}$/.test(phone)) return { phone, ok: true } // Malaysian mobile
    if (/^60[3-9]\d{7,8}$/.test(phone)) {
      flags.push("phone_landline") // can't receive WhatsApp
      return { phone, ok: false }
    }
    flags.push("phone_invalid")
    return { phone, ok: false }
  }
  if (phone.length >= 8 && phone.length <= 15) {
    flags.push("phone_foreign")
    return { phone, ok: true }
  }
  flags.push("phone_invalid")
  return { phone, ok: false }
}

export function cleanLead(raw: Record<string, unknown>): CleanLead {
  const row = normalizeRow(raw)
  const flags: LeadFlag[] = []

  const fullName =
    pick(row, NAME_KEYS) ||
    [pick(row, FIRST_KEYS), pick(row, LAST_KEYS)].filter(Boolean).join(" ")
  const { name, greeting } = tidyName(fullName, flags)
  const { email, ok: emailOk, work } = tidyEmail(pick(row, EMAIL_KEYS), flags)
  const { phone, ok: whatsappOk } = tidyPhone(pick(row, PHONE_KEYS), flags)

  const extra: Record<string, string> = {}
  for (const [k, v] of row) {
    if (KNOWN_KEYS.has(k)) continue
    if (Object.keys(extra).length >= MAX_EXTRA_FIELDS) break
    extra[k] = v.slice(0, MAX_EXTRA_LENGTH)
  }

  return {
    name,
    greetingName: greeting,
    email,
    emailOk,
    workEmail: work,
    phone,
    whatsappOk,
    flags,
    extra,
  }
}

/**
 * The same person across files and imports: their email, else their phone.
 * Null when there's neither (kept, but can't be matched to anyone).
 */
export function dedupeKey(lead: CleanLead): string | null {
  if (lead.emailOk) return `email:${lead.email}`
  if (lead.phone && !lead.flags.includes("phone_invalid"))
    return `phone:${lead.phone}`
  return null
}

// Flags that matter for an email conversation. Phone problems don't stop us
// emailing someone, so they're shown on the lead but don't need a look.
const EMAIL_CONCERNS: LeadFlag[] = [
  "name_unusable",
  "email_suspicious",
  "email_multiple",
]

/** Emailable, but something a person should glance at before we write to them. */
export function needsALook(lead: CleanLead): boolean {
  return lead.emailOk && lead.flags.some((f) => EMAIL_CONCERNS.includes(f))
}
