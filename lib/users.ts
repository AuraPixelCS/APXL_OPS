// Ops accounts: their shape, the rules for creating and editing them, and
// password generation. Shared by Settings → Users (browser) and /api/users/*
// (server), which re-checks everything before touching Firebase Auth.

import { type AppRole } from "@/lib/roles"

export interface OpsUser {
  uid: string
  email: string
  name: string
  role: AppRole | null
  /** The client's business, for client accounts. */
  company: string
  /** Suspended: can't sign in until restored. */
  disabled: boolean
  createdAt: string | null
  lastSignInAt: string | null
  createdBy: string | null
}

export interface NewUserInput {
  email: string
  name: string
  role: AppRole
  company: string
  /** Empty = generate one. */
  password: string
}

export interface UserUpdateInput {
  uid: string
  name?: string
  role?: AppRole
  company?: string
  disabled?: boolean
}

export const MIN_PASSWORD = 10

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i

export function passwordProblem(pw: string): string | null {
  if (pw.length < MIN_PASSWORD)
    return `Use at least ${MIN_PASSWORD} characters.`
  if (pw.length > 128) return "Keep it under 128 characters."
  if (/^\s|\s$/.test(pw)) return "Don't start or end with a space."
  return null
}

export function validateNewUser(
  input: unknown
):
  | { ok: true; values: NewUserInput }
  | { ok: false; errors: Record<string, string> } {
  const src = (input && typeof input === "object" ? input : {}) as Record<
    string,
    unknown
  >
  const str = (k: string) =>
    typeof src[k] === "string" ? (src[k] as string) : ""
  const values: NewUserInput = {
    email: str("email").trim().toLowerCase(),
    name: str("name").trim(),
    role: src.role === "admin" ? "admin" : "client",
    company: str("company").trim(),
    password: str("password"),
  }
  const errors: Record<string, string> = {}
  if (!EMAIL_RE.test(values.email))
    errors.email = "Enter a valid email address."
  if (!values.name) errors.name = "Enter their name."
  else if (values.name.length > 80) errors.name = "Keep it under 80 characters."
  if (values.role === "client" && !values.company)
    errors.company = "Enter the client's business name."
  if (values.company.length > 120)
    errors.company = "Keep it under 120 characters."
  if (values.password) {
    const p = passwordProblem(values.password)
    if (p) errors.password = p
  }
  return Object.keys(errors).length
    ? { ok: false, errors }
    : { ok: true, values }
}

// No 0/O, 1/l/I: generated passwords are read out or retyped from a message.
const ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"

/** 16 random characters in groups of four, e.g. "k7Rm-Wq3x-Tz9d-Hp4e" (~93 bits). */
export function generatePassword(): string {
  const bytes = new Uint32Array(16)
  crypto.getRandomValues(bytes)
  const chars = Array.from(bytes, (n) => ALPHABET[n % ALPHABET.length])
  return [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join("")).join("-")
}

/** Text an admin can paste into WhatsApp or email to hand over a login. */
export function signInDetails(
  email: string,
  password: string,
  loginUrl: string
): string {
  return `Your AuraPixel login\n${loginUrl}\nEmail: ${email}\nPassword: ${password}\n\nYou can change your password after signing in.`
}
