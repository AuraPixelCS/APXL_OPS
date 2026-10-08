// Ops settings: what they are, their starting values, and the rules for saving
// them. Shared by the Settings page (browser) and POST /api/settings (server),
// which runs the same validation before writing `settings/{section}`.
//
// Secrets (API keys, mailbox passwords) never live here. They stay in server
// env vars and n8n credentials; the Connections tab only shows whether they're set.

export type ReplyMode = "approve" | "auto"
export type NextStep = "call" | "whatsapp" | "either"

export interface EmailSettings {
  senderName: string
  /** Intro emails come FROM this address and replies come back TO it. */
  address: string
  signature: string
  introSubject: string
  introBody: string
}

export interface AssistantSettings {
  replyMode: ReplyMode
  nextStep: NextStep
  bookingUrl: string
  whatsapp: string
  knowledge: string
  rules: string
}

export interface ScoringSettings {
  hot: string
  warm: string
  cold: string
}

export interface SettingsMap {
  email: EmailSettings
  assistant: AssistantSettings
  scoring: ScoringSettings
}

export type SettingsSection = keyof SettingsMap

export const SETTINGS_SECTIONS: SettingsSection[] = [
  "email",
  "assistant",
  "scoring",
]

/** Placeholders the intro email understands. */
export const INTRO_PLACEHOLDERS = ["{name}", "{signature}"] as const

export const DEFAULT_SETTINGS: SettingsMap = {
  email: {
    senderName: "AuraPixel",
    address: "hello@aurapixel.live",
    signature:
      "The AuraPixel team\nMid Valley Boulevard, Kuala Lumpur\naurapixel.live · +6010-284 1290",
    introSubject: "Your enquiry with AuraPixel",
    introBody: [
      "Hi {name},",
      "",
      "Thanks for reaching out to AuraPixel. Before we suggest anything, we'd like to understand what you need.",
      "",
      "Could you tell us a little about:",
      "1. What you'd like help with: social content, ads, a podcast, an event, or a mix",
      "2. When you're hoping to get started",
      "3. Whether you have a monthly marketing budget in mind",
      "",
      "Just reply to this email and we'll take it from there.",
      "",
      "{signature}",
    ].join("\n"),
  },
  assistant: {
    replyMode: "approve",
    nextStep: "either",
    bookingUrl: "",
    whatsapp: "+6010-284 1290",
    knowledge: [
      "About AuraPixel. AuraPixel is a creative and marketing studio at Mid Valley Boulevard, Kuala Lumpur. Our promise: bold ideas, built to perform. We take brands from nothing to a live, lead-generating presence: strategy, content, production and paid ads under one roof, all done in-house by our own team.",
      "",
      "What makes us different. We're built around leads, not likes. Every ringgit is measured against actual leads (named people at named companies), not impressions or reach.",
      "",
      "Services. Digital marketing: social content, Meta ads and growth strategy, with a monthly report. Podcast and content production: recording in our own studio, editing, clips and distribution on Spotify, YouTube and Apple Podcasts. Event management: production, promotion and live engagement, from concerts to corporate milestones. Add-ons, quoted on scope: Meta ads management, branding, website development, extra podcast episodes.",
      "",
      "Plans. Digital Marketing: 12–16 posts and 8 reels a month, managed ads, monthly report. DM + Podcast (most popular): 12 posts, 12 reels and 4 podcast episodes a month with managed ads. Brand Authority: daily posts, 24–30 reels, 8 podcast episodes, aggressive ad scaling and a reporting dashboard.",
      "",
      "Pricing. Every plan is custom-priced on scope; we don't publish fixed rates. Commitment length is flexible and discussed on a call.",
      "",
      "Results. Our most recent brand launch went from nothing to a live brand generating leads in 30 days, with 90+ leads in the first month at around RM 25 per B2B lead.",
      "",
      "Selected work. PEOPLElogy 25th anniversary (end-to-end event production), GV Prakash Celebration of Life (concert production), Nasi Kandar Kayu with Irfan's View (heritage F&B campaign), VJ Siddhu Kaara Saaram (celebrity endorsement and Penang activation), Namma Veetukalyanam (luxury destination wedding), SKILL2U (digital marketing).",
      "",
      "How we work. 1 Discovery and strategy. 2 Content planning. 3 Production, all in-house. 4 Optimisation. 5 Growth: the channels that produce leads get more fuel each month.",
      "",
      "Who we work with. New brand launches, public-listed groups launching new brands, artists and entertainers, heritage restaurants and F&B, education and training companies, and any business that needs leads, B2B or B2C.",
    ].join("\n"),
    rules: [
      "Write like a sharp studio producer: friendly, confident, direct. Short emails, plain words, no marketing fluff.",
      "Answer what they asked first, then ask at most two questions to learn what they need, when, and their budget.",
      "Never quote a price, discount or deadline. Every plan is custom-priced; the way to a number is a quick call.",
      "Never promise results beyond the facts you were given.",
      "When they're interested, guide them to the next step. If they ask for a person, say a team member will follow up.",
      "Reply in the language they wrote in. Sign off with the signature only; don't invent names.",
    ].join("\n"),
  },
  scoring: {
    hot: "A real business (not a student, job seeker or vendor) that needs marketing, content, a podcast or an event, wants to start within the next two months, and has a budget in mind or asks about pricing or a call.",
    warm: "A real business with a clear need but no timing or budget yet, or still comparing options.",
    cold: "Students, job seekers, people selling to us, fake or missing details, or no clear need for what we do.",
  },
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i

type Rule = {
  max: number
  required?: boolean
  email?: boolean
  url?: boolean
  oneOf?: readonly string[]
}

const RULES: { [S in SettingsSection]: Record<keyof SettingsMap[S], Rule> } = {
  email: {
    senderName: { max: 80, required: true },
    address: { max: 200, required: true, email: true },
    signature: { max: 1000 },
    introSubject: { max: 150, required: true },
    introBody: { max: 5000, required: true },
  },
  assistant: {
    replyMode: { max: 20, required: true, oneOf: ["approve", "auto"] },
    nextStep: {
      max: 20,
      required: true,
      oneOf: ["call", "whatsapp", "either"],
    },
    bookingUrl: { max: 500, url: true },
    whatsapp: { max: 30 },
    knowledge: { max: 20000, required: true },
    rules: { max: 5000, required: true },
  },
  scoring: {
    hot: { max: 2000, required: true },
    warm: { max: 2000, required: true },
    cold: { max: 2000, required: true },
  },
}

export type FieldErrors = Partial<Record<string, string>>

/**
 * Checks one section. Returns the cleaned values (trimmed, only known keys) or
 * per-field messages written for the person filling in the form.
 */
export function validateSettings<S extends SettingsSection>(
  section: S,
  input: unknown
): { ok: true; values: SettingsMap[S] } | { ok: false; errors: FieldErrors } {
  const rules = RULES[section] as Record<string, Rule>
  const src = (input && typeof input === "object" ? input : {}) as Record<
    string,
    unknown
  >
  const values: Record<string, string> = {}
  const errors: FieldErrors = {}

  for (const [key, rule] of Object.entries(rules)) {
    const raw = src[key]
    const value = typeof raw === "string" ? raw.trim() : ""
    values[key] = value
    if (rule.required && !value) errors[key] = "This can't be empty."
    else if (value.length > rule.max)
      errors[key] = `Keep this under ${rule.max} characters.`
    else if (value && rule.email && !EMAIL_RE.test(value))
      errors[key] = "That isn't a valid email address."
    else if (value && rule.url && !/^https:\/\/\S+$/i.test(value))
      errors[key] = "Use a full link starting with https://"
    else if (value && rule.oneOf && !rule.oneOf.includes(value))
      errors[key] = "Pick one of the options."
  }

  return Object.keys(errors).length > 0
    ? { ok: false, errors }
    : { ok: true, values: values as unknown as SettingsMap[S] }
}

/** The intro email exactly as a lead would read it. */
export function renderIntro(
  email: EmailSettings,
  greetingName: string
): { subject: string; body: string } {
  const fill = (text: string) =>
    text
      .replaceAll("{name}", greetingName)
      .replaceAll("{signature}", email.signature)
  return { subject: fill(email.introSubject), body: fill(email.introBody) }
}
