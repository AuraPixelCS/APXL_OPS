// Email blasts: the email's shape, its rules, and how it renders. Pure, so the
// editor's live preview, the test send and the real send all produce exactly
// the same email, and `npm test` covers it.

import {
  cleanHtml,
  fileNameOf,
  findImages,
  findLinks,
  htmlToText,
  isLocalSrc,
  linkProblem,
  UNSUBSCRIBE_PLACEHOLDER,
  withScheme,
} from "./html.ts"

/** "standard" = Ops' own layout from the fields below; "custom" = the
 * client's finished design (HTML) in `html`. */
export type BlastDesign = "standard" | "custom"

export interface BlastEmail {
  fromName: string
  fromEmail: string
  /** Replies go here. Empty = back to fromEmail. */
  replyTo: string
  subject: string
  /** The grey line inboxes show after the subject. */
  preheader: string
  /** An uploaded image (`blastAssets/{id}`), or "" for no banner. */
  bannerId: string
  bannerLink: string
  heading: string
  /** Plain text with light formatting; see formatting help in the editor. */
  body: string
  buttonLabel: string
  buttonUrl: string
  buttonColor: string
  /** Small print under the email: who it's from, an address. */
  footer: string
  design: BlastDesign
  /** The custom design. Kept even while the standard layout is chosen. */
  html: string
}

export type BlastEmailField = keyof BlastEmail

export const BLAST_PLACEHOLDER = "{name}"

export const BLAST_LIMITS = {
  fromName: 80,
  subject: 150,
  preheader: 150,
  heading: 120,
  body: 10000,
  buttonLabel: 40,
  footer: 600,
  url: 2000,
  html: 200_000,
} as const

/** Gmail cuts emails off after about 102 KB of HTML, hiding what's below
 * (including the Unsubscribe link). */
export const HTML_CLIP_WARNING = 100_000

export const DEFAULT_BUTTON_COLOR = "#0272e2"

/** A new blast's email, from Settings → Email. */
export function defaultBlastEmail(sender: {
  senderName: string
  address: string
  signature: string
}): BlastEmail {
  return {
    fromName: sender.senderName,
    fromEmail: sender.address,
    replyTo: "",
    subject: "",
    preheader: "",
    bannerId: "",
    bannerLink: "",
    heading: "",
    body: `Hi ${BLAST_PLACEHOLDER},\n\n`,
    buttonLabel: "",
    buttonUrl: "",
    buttonColor: DEFAULT_BUTTON_COLOR,
    footer: sender.signature,
    design: "standard",
    html: "",
  }
}

const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i
const URL_RE = /^(https?:\/\/[^\s<>"]+|mailto:[^\s<>"]+|tel:\+?[\d\s()-]+)$/i
const COLOR_RE = /^#[0-9a-f]{6}$/i

/**
 * Checks a blast email. `sending` adds what a real send needs (sender,
 * subject, body); saving a half-written draft only checks what's there.
 */
export function validateBlastEmail(
  input: unknown,
  { sending = false }: { sending?: boolean } = {}
):
  | { ok: true; email: BlastEmail }
  | { ok: false; errors: Partial<Record<BlastEmailField, string>> } {
  const src = (input && typeof input === "object" ? input : {}) as Record<
    string,
    unknown
  >
  const str = (k: BlastEmailField) =>
    typeof src[k] === "string" ? (src[k] as string) : ""
  const email: BlastEmail = {
    fromName: str("fromName").trim().replace(/\s+/g, " "),
    fromEmail: str("fromEmail").trim().toLowerCase(),
    replyTo: str("replyTo").trim().toLowerCase(),
    subject: str("subject").trim().replace(/\s+/g, " "),
    preheader: str("preheader").trim().replace(/\s+/g, " "),
    bannerId: str("bannerId").trim(),
    bannerLink: withScheme(str("bannerLink")),
    heading: str("heading").trim(),
    body: str("body").replace(/\r\n?/g, "\n").replace(/\s+$/, ""),
    buttonLabel: str("buttonLabel").trim(),
    buttonUrl: withScheme(str("buttonUrl")),
    buttonColor: str("buttonColor").trim() || DEFAULT_BUTTON_COLOR,
    footer: str("footer").replace(/\r\n?/g, "\n").trim(),
    design: str("design") === "custom" ? "custom" : "standard",
    html: str("html").trim() ? cleanHtml(str("html")).trim() : "",
  }
  const e: Partial<Record<BlastEmailField, string>> = {}
  const tooLong = (k: BlastEmailField, max: number) => {
    if (email[k].length > max)
      e[k] = `Keep it under ${max.toLocaleString()} characters.`
  }
  tooLong("fromName", BLAST_LIMITS.fromName)
  tooLong("subject", BLAST_LIMITS.subject)
  tooLong("preheader", BLAST_LIMITS.preheader)
  tooLong("heading", BLAST_LIMITS.heading)
  tooLong("body", BLAST_LIMITS.body)
  tooLong("buttonLabel", BLAST_LIMITS.buttonLabel)
  tooLong("footer", BLAST_LIMITS.footer)
  if (/["<>\\]/.test(email.fromName))
    e.fromName = "Leave out quotes and angle brackets."
  if (email.fromEmail && !EMAIL_RE.test(email.fromEmail))
    e.fromEmail = "Enter a full email address, like hello@aurapixel.live."
  if (email.replyTo && !EMAIL_RE.test(email.replyTo))
    e.replyTo = "Enter a full email address, or leave it empty."
  for (const k of ["bannerLink", "buttonUrl"] as const) {
    if (email[k] && !URL_RE.test(email[k]))
      e[k] = "Use a full link starting with https://"
    else tooLong(k, BLAST_LIMITS.url)
  }
  if (email.buttonLabel && !email.buttonUrl && !e.buttonUrl)
    e.buttonUrl = "Where should the button go?"
  if (email.buttonUrl && !email.buttonLabel)
    e.buttonLabel = "What should the button say?"
  if (!COLOR_RE.test(email.buttonColor))
    e.buttonColor = "Use a colour like #0272e2."
  if (email.bannerId && !/^[A-Za-z0-9]{10,40}$/.test(email.bannerId))
    e.bannerId = "Upload the banner again."
  if (email.html.length > BLAST_LIMITS.html)
    e.html = "This design is too big. Keep it under 200 KB."
  else if (email.design === "custom") {
    const problem = designProblem(email.html, sending)
    if (problem) e.html = problem
  }
  if (sending) {
    if (!email.fromName) e.fromName ??= "Who is this email from?"
    if (!email.fromEmail) e.fromEmail ??= "Which address does it come from?"
    if (!email.subject) e.subject ??= "Write a subject line."
    if (
      email.design === "standard" &&
      !email.body.replace(new RegExp(`Hi ${BLAST_PLACEHOLDER},?`), "").trim()
    )
      e.body ??= "Write the email."
  }
  return Object.keys(e).length ? { ok: false, errors: e } : { ok: true, email }
}

/** Why a custom design can't be saved (or, when `sending`, sent) yet. */
function designProblem(html: string, sending: boolean): string {
  if (!html) return sending ? "Add your design." : ""
  const bad = findLinks(html).filter((l) => {
    const p = linkProblem(l.url)
    return p && (sending || p !== "Needs a link")
  })
  if (bad.length)
    return bad.length === 1
      ? `Check the link “${bad[0].text}” under Links.`
      : `Check ${bad.length} links under Links.`
  if (sending) {
    const missing = [
      ...new Set(
        findImages(html)
          .filter((i) => isLocalSrc(i.src))
          .map((i) => fileNameOf(i.src))
      ),
    ]
    if (missing.length)
      return `Upload the missing image${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`
  }
  return ""
}

// ── Rendering ──────────────────────────────────────────────────────────────

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")

const fill = (text: string, name: string) =>
  text.replaceAll(BLAST_PLACEHOLDER, name || "there")

/** Black or white text, whichever reads better on `hex`. */
export function textOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return lum > 0.4 ? "#111827" : "#ffffff"
}

const LINK_RE = /\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:|tel:)[^\s)]+)\)/g
const BARE_URL_RE = /(^|[\s(])(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g

/** One line of body text → safe HTML: **bold**, [text](link), bare links. */
function inline(line: string, linkColor: string): string {
  const links: string[] = []
  const style = `color:${linkColor};text-decoration:underline;`
  let s = line
    .replace(/\u0000/g, "")
    .replace(LINK_RE, (_, text: string, url: string) => {
      links.push(`<a href="${esc(url)}" style="${style}">${esc(text)}</a>`)
      return `\u0000${links.length - 1}\u0000`
    })
  s = esc(s)
  s = s.replace(
    BARE_URL_RE,
    (_, pre: string, url: string) =>
      `${pre}<a href="${url}" style="${style}">${url}</a>`
  )
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
  return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => links[Number(i)])
}

type Block =
  { kind: "p"; lines: string[] } | { kind: "ul" | "ol"; items: string[] }

function blocks(body: string): Block[] {
  const out: Block[] = []
  for (const chunk of body.split(/\n\s*\n/)) {
    const lines = chunk.split("\n").filter((l) => l.trim())
    if (!lines.length) continue
    if (lines.every((l) => /^\s*[-•*]\s+/.test(l)))
      out.push({
        kind: "ul",
        items: lines.map((l) => l.replace(/^\s*[-•*]\s+/, "")),
      })
    else if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l)))
      out.push({
        kind: "ol",
        items: lines.map((l) => l.replace(/^\s*\d+[.)]\s+/, "")),
      })
    else out.push({ kind: "p", lines })
  }
  return out
}

export function bodyToHtml(
  body: string,
  linkColor = DEFAULT_BUTTON_COLOR
): string {
  return blocks(body)
    .map((b) => {
      if (b.kind === "p")
        return `<p style="margin:0 0 16px;">${b.lines.map((l) => inline(l, linkColor)).join("<br>")}</p>`
      const items = b.items
        .map((i) => `<li style="margin:0 0 6px;">${inline(i, linkColor)}</li>`)
        .join("")
      return `<${b.kind} style="margin:0 0 16px;padding-left:24px;">${items}</${b.kind}>`
    })
    .join("\n")
}

export function bodyToText(body: string): string {
  return body
    .replace(LINK_RE, (_, text: string, url: string) => `${text} (${url})`)
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
}

export interface RenderOptions {
  /** The recipient's first name, or "" for "there". */
  name: string
  /** Absolute URL of the banner image, or "" when there's none. */
  bannerSrc: string
  unsubscribeUrl: string
}

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

/** The finished email: subject, HTML and plain-text versions. */
export function renderBlastEmail(
  email: BlastEmail,
  { name, bannerSrc, unsubscribeUrl }: RenderOptions
): { subject: string; html: string; text: string } {
  if (email.design === "custom")
    return renderCustom(email, { name, unsubscribeUrl })
  const color = COLOR_RE.test(email.buttonColor)
    ? email.buttonColor
    : DEFAULT_BUTTON_COLOR
  // Names come from imported sheets, so they're put in AFTER formatting and
  // escaped: a "name" written as [a link](https://…) stays plain text.
  const put = (html: string) =>
    html.replaceAll(BLAST_PLACEHOLDER, esc(name || "there"))
  const subject = fill(email.subject, name)
  const heading = fill(email.heading, name)

  const banner = bannerSrc
    ? `<tr><td style="padding:0;">${email.bannerLink ? `<a href="${esc(email.bannerLink)}">` : ""}<img src="${esc(bannerSrc)}" width="600" alt="${esc(heading || subject)}" style="display:block;width:100%;max-width:600px;height:auto;border:0;"/>${email.bannerLink ? "</a>" : ""}</td></tr>`
    : ""
  const headingHtml = email.heading
    ? `<h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;font-weight:700;color:#111827;">${put(esc(email.heading))}</h1>`
    : ""
  const button =
    email.buttonLabel && email.buttonUrl
      ? `<tr><td style="padding:0 32px 32px;"><a href="${esc(email.buttonUrl)}" style="display:inline-block;background:${color};color:${textOn(color)};font-family:${FONT};font-size:16px;font-weight:600;line-height:1;text-decoration:none;padding:14px 28px;border-radius:8px;">${esc(email.buttonLabel)}</a></td></tr>`
      : ""
  const footer = email.footer
    ? `${email.footer.split("\n").map(esc).join("<br>")}<br><br>`
    : ""

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;">
${email.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${put(esc(email.preheader))}${"&#847;&zwnj;&nbsp;".repeat(40)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;">
${banner}
<tr><td style="padding:32px 32px 16px;font-family:${FONT};font-size:16px;line-height:1.6;color:#1f2937;">
${headingHtml}
${put(bodyToHtml(email.body, color))}
</td></tr>
${button}
</table>
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
<tr><td style="padding:20px 24px;font-family:${FONT};font-size:12px;line-height:1.6;color:#6b7280;text-align:center;">
${footer}You're getting this because you got in touch with ${esc(email.fromName || "us")}.<br>
<a href="${esc(unsubscribeUrl)}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`

  const text = [
    heading,
    fill(bodyToText(email.body), name),
    email.buttonLabel && email.buttonUrl
      ? `${email.buttonLabel}: ${email.buttonUrl}`
      : "",
    email.footer,
    `Unsubscribe: ${unsubscribeUrl}`,
  ]
    .filter(Boolean)
    .join("\n\n")

  return { subject, html, text }
}

/** A custom design, personalised. The design's own Unsubscribe link (href
 * "{unsubscribe_url}") is used when it has one; otherwise a small line is
 * added at the bottom, because every email needs one. */
function renderCustom(
  email: BlastEmail,
  { name, unsubscribeUrl }: Pick<RenderOptions, "name" | "unsubscribeUrl">
): { subject: string; html: string; text: string } {
  const subject = fill(email.subject, name)
  let html = email.html
  if (!/<html[\s>]/i.test(html))
    html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;">
${html}
</body>
</html>`
  if (!html.includes(UNSUBSCRIBE_PLACEHOLDER)) {
    const line = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:20px 24px;font-family:${FONT};font-size:12px;line-height:1.6;color:#6b7280;text-align:center;">You're getting this because you got in touch with ${esc(email.fromName || "us")}.<br><a href="${UNSUBSCRIBE_PLACEHOLDER}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a></td></tr></table>`
    const at = html.search(/<\/body\s*>(?![\s\S]*<\/body)/i)
    html =
      at >= 0 ? html.slice(0, at) + line + "\n" + html.slice(at) : html + line
  }
  if (email.preheader)
    html = html.replace(
      /<body\b[^>]*>/i,
      (tag) =>
        `${tag}\n<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(email.preheader)}${"&#847;&zwnj;&nbsp;".repeat(40)}</div>`
    )
  // Names come from imported sheets: escaped, and put in last.
  html = html
    .replaceAll(UNSUBSCRIBE_PLACEHOLDER, esc(unsubscribeUrl))
    .replaceAll(BLAST_PLACEHOLDER, esc(name || "there"))
  let text = htmlToText(html)
  if (!text.includes(unsubscribeUrl))
    text += `\n\nUnsubscribe: ${unsubscribeUrl}`
  return { subject, html, text }
}

/** Firestore doc id for an address (recipients, unsubscribes). */
export function emailDocId(email: string): string {
  return email.trim().toLowerCase().replace(/\//g, "%2F")
}
