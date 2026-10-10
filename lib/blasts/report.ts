// The report a client gets about their blast: how many people were on the
// list, how many were emailed and when, and (from Resend) how many emails
// arrived, bounced, or were opened and clicked. AuraPixel-branded. Pure, so the
// dialog's preview, Save as PDF and the email that goes out are the same.

import type { RecipientStatus } from "@/lib/blasts/types"

/** What happened to one sent email, from Resend's last event for it. */
export type Delivery =
  | "delivered"
  | "opened"
  | "clicked"
  | "bounced"
  | "complained"
  | "pending"
  | "unknown"

export function deliveryOf(lastEvent: string | null | undefined): Delivery {
  switch (lastEvent) {
    case "delivered":
    case "opened":
    case "clicked":
    case "bounced":
    case "complained":
      return lastEvent
    case "failed":
    case "suppressed":
    case "canceled":
      return "bounced"
    case "sent":
    case "queued":
    case "scheduled":
    case "delivery_delayed":
      return "pending"
    default:
      return "unknown"
  }
}

/** Resend's "2026-10-09 15:46:56.073000+00" → Date. */
export function parseResendTime(raw: unknown): Date | null {
  const m = String(raw ?? "").match(
    /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d{1,3})\d*)?(Z|[+-]\d{2}(?::?\d{2})?)?$/
  )
  if (!m) return null
  const zone =
    !m[4] || m[4] === "Z" ? "Z" : m[4].length === 3 ? `${m[4]}:00` : m[4]
  const d = new Date(`${m[1]}T${m[2]}.${(m[3] ?? "0").padEnd(3, "0")}${zone}`)
  return Number.isNaN(d.getTime()) ? null : d
}

export interface ReportInput {
  blastName: string
  /** The email's subject line: what people saw. */
  campaign: string
  /** The client it was sent for ("" = AuraPixel's own). */
  client: string
  fromName: string
  fromEmail: string
  /** Everyone emailable in the blast now, in list order. */
  audience: { email: string; name: string }[]
  recipients: {
    email: string
    name: string
    status: RecipientStatus
    sentAt: Date | null
    resendId: string | null
    unsubscribedAt: Date | null
  }[]
  /** Addresses that opted out of every blast. */
  unsubscribed: Set<string>
  /** Resend's last event by email id; null when it couldn't be checked. */
  events: Map<string, string> | null
  /** Whether the sending domain tracks opens and clicks. */
  tracking: { opens: boolean; clicks: boolean }
  now: Date
}

export interface DeliveryCounts {
  /** Sent emails Resend told us about. */
  checked: number
  delivered: number
  opened: number
  clicked: number
  bounced: number
  complained: number
  /** Still on their way (or delayed). */
  pending: number
  tracking: { opens: boolean; clicks: boolean }
}

/** Plain JSON, so the API can hand it to the dialog. Dates are ISO. */
export interface BlastReport {
  blastName: string
  campaign: string
  client: string
  from: string
  generatedAt: string
  firstSentAt: string | null
  lastSentAt: string | null
  /** On the list: everyone emailable, plus anyone emailed since removed. */
  people: number
  sent: number
  toSend: number
  /** Opted out before it was their turn, so never emailed. */
  skipped: number
  /** Emailed, then opted out. */
  unsubscribed: number
  rounds: { day: string; sent: number }[]
  delivery: DeliveryCounts | null
}

/** One line of the CSV the client can get with the report. */
export interface ReportRow {
  email: string
  name: string
  status: string
  sentAt: Date | null
}

const TZ = "Asia/Kuala_Lumpur"
const dayKey = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})
const dayLabel = new Intl.DateTimeFormat("en-MY", {
  timeZone: TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
})
const dateOnly = new Intl.DateTimeFormat("en-MY", {
  timeZone: TZ,
  day: "numeric",
  month: "short",
  year: "numeric",
})
const dateTime = new Intl.DateTimeFormat("en-MY", {
  timeZone: TZ,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

const DELIVERY_LABEL: Record<Delivery, string> = {
  delivered: "Delivered",
  opened: "Opened",
  clicked: "Clicked",
  bounced: "Bounced",
  complained: "Marked as spam",
  pending: "On its way",
  unknown: "Sent",
}

export function buildReport(input: ReportInput): {
  report: BlastReport
  rows: ReportRow[]
} {
  const recs = new Map(input.recipients.map((r) => [r.email, r]))
  const names = new Map(input.audience.map((a) => [a.email, a.name]))
  const sentRecs = input.recipients
    .filter((r) => r.status === "sent")
    .sort((a, b) => (a.sentAt?.getTime() ?? 0) - (b.sentAt?.getTime() ?? 0))
  const sentSet = new Set(sentRecs.map((r) => r.email))

  const counts: Record<Delivery, number> = {
    delivered: 0,
    opened: 0,
    clicked: 0,
    bounced: 0,
    complained: 0,
    pending: 0,
    unknown: 0,
  }
  const rows: ReportRow[] = []
  let unsubscribed = 0
  for (const r of sentRecs) {
    const delivery = input.events
      ? deliveryOf(r.resendId ? input.events.get(r.resendId) : undefined)
      : "unknown"
    counts[delivery]++
    const optedOut =
      Boolean(r.unsubscribedAt) || input.unsubscribed.has(r.email)
    if (optedOut) unsubscribed++
    rows.push({
      email: r.email,
      name: names.get(r.email) || r.name,
      status: optedOut ? "Unsubscribed" : DELIVERY_LABEL[delivery],
      sentAt: r.sentAt,
    })
  }
  let toSend = 0
  let skipped = 0
  for (const a of input.audience) {
    if (sentSet.has(a.email)) continue
    const out = input.unsubscribed.has(a.email)
    if (out) skipped++
    else toSend++
    rows.push({
      email: a.email,
      name: a.name || recs.get(a.email)?.name || "",
      status: out ? "Opted out earlier" : "Not sent yet",
      sentAt: null,
    })
  }

  const rounds = new Map<string, { day: string; sent: number }>()
  for (const r of sentRecs) {
    if (!r.sentAt) continue
    const key = dayKey.format(r.sentAt)
    const round = rounds.get(key) ?? { day: dayLabel.format(r.sentAt), sent: 0 }
    round.sent++
    rounds.set(key, round)
  }
  const times = sentRecs.flatMap((r) => (r.sentAt ? [r.sentAt.getTime()] : []))
  const opened = counts.opened + counts.clicked
  const clicked = counts.clicked

  const report: BlastReport = {
    blastName: input.blastName,
    campaign: input.campaign || input.blastName,
    client: input.client,
    from: input.fromName
      ? `${input.fromName} <${input.fromEmail}>`
      : input.fromEmail,
    generatedAt: input.now.toISOString(),
    firstSentAt: times.length
      ? new Date(Math.min(...times)).toISOString()
      : null,
    lastSentAt: times.length
      ? new Date(Math.max(...times)).toISOString()
      : null,
    people: sentRecs.length + toSend + skipped,
    sent: sentRecs.length,
    toSend,
    skipped,
    unsubscribed,
    rounds: [...rounds.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, r]) => r),
    delivery: input.events
      ? {
          checked: sentRecs.length - counts.unknown,
          delivered:
            counts.delivered +
            counts.opened +
            counts.clicked +
            counts.complained,
          opened,
          clicked,
          bounced: counts.bounced,
          complained: counts.complained,
          pending: counts.pending,
          // Events prove tracking was on when they were sent, even if it's off now.
          tracking: {
            opens: input.tracking.opens || opened > 0,
            clicks: input.tracking.clicks || clicked > 0,
          },
        }
      : null,
  }
  return { report, rows }
}

// ── Rendering ──────────────────────────────────────────────────────────────

export const REPORT_NOTE_MAX = 1000

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
const INK = "#0b1220"
const BODY = "#1f2937"
const MUTED = "#6b7280"
const LINE = "#e5e7eb"
const BLUE = "#0272e2"
const TILE = "#f3f8ff"

const n = (v: number) => v.toLocaleString("en-MY")

/** 97.4%, or "" when there's nothing to divide by. */
export function percent(part: number, whole: number): string {
  if (!whole) return ""
  return `${((part / whole) * 100).toFixed(1).replace(/\.0$/, "")}%`
}

function period(r: BlastReport): string {
  if (!r.firstSentAt || !r.lastSentAt) return ""
  // "9–10 Oct 2026", "30 Sep – 2 Oct 2026", or one date.
  return dateOnly.formatRange(new Date(r.firstSentAt), new Date(r.lastSentAt))
}

type Tile = { label: string; value: string; sub: string }

/** Two to a row, so always an even number. */
function tiles(r: BlastReport): Tile[] {
  const d = r.delivery
  const unsub: Tile = {
    label: "Unsubscribed",
    value: n(r.unsubscribed),
    sub: percent(r.unsubscribed, r.sent),
  }
  const toSend: Tile = { label: "Still to send", value: n(r.toSend), sub: "" }
  if (!d)
    return [
      { label: "People on the list", value: n(r.people), sub: "" },
      {
        label: "Emails sent",
        value: n(r.sent),
        sub: percent(r.sent, r.people),
      },
      toSend,
      unsub,
    ]
  const out: Tile[] = [
    {
      label: "Emails sent",
      value: n(r.sent),
      sub: r.people ? `of ${n(r.people)} on the list` : "",
    },
    {
      label: "Delivered",
      value: n(d.delivered),
      sub: percent(d.delivered, d.checked),
    },
  ]
  if (d.tracking.opens)
    out.push({
      label: "Opened",
      value: n(d.opened),
      sub: percent(d.opened, d.delivered),
    })
  if (d.tracking.clicks)
    out.push({
      label: "Clicked",
      value: n(d.clicked),
      sub: percent(d.clicked, d.delivered),
    })
  out.push(
    {
      label: "Bounced",
      value: n(d.bounced),
      sub: percent(d.bounced, d.checked),
    },
    unsub
  )
  if (out.length % 2) out.push(toSend)
  return out
}

/** "The list" rows: label, value, and whether it's the headline row. */
function listLines(r: BlastReport): [string, string, boolean][] {
  const d = r.delivery
  const out: [string, string, boolean][] = [
    ["People on the list", n(r.people), true],
    ["Emailed", n(r.sent), false],
    ["Still to send", n(r.toSend), false],
  ]
  if (r.skipped) out.push(["Opted out before their turn", n(r.skipped), false])
  if (d?.pending) out.push(["Still being delivered", n(d.pending), false])
  if (d?.complained) out.push(["Marked as spam", n(d.complained), false])
  return out
}

function roundLines(r: BlastReport): [string, string][] {
  return r.rounds.map((x) => [
    x.day,
    `${n(x.sent)} ${x.sent === 1 ? "email" : "emails"}`,
  ])
}

const sentShare = (r: BlastReport) =>
  r.people ? Math.round((r.sent / r.people) * 100) : 0

function tileHtml(t: Tile | undefined): string {
  if (!t) return `<td width="50%" style="width:50%;padding:6px;"></td>`
  return `<td width="50%" valign="top" style="width:50%;padding:6px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${TILE};border-radius:10px;">
<tr><td style="padding:16px 18px;font-family:${FONT};">
<div style="font-size:13px;line-height:1.4;color:${MUTED};">${esc(t.label)}</div>
<div style="font-size:28px;line-height:1.2;font-weight:700;color:${INK};padding-top:4px;">${esc(t.value)}</div>
<div style="font-size:13px;line-height:1.4;color:${BLUE};font-weight:600;min-height:18px;">${t.sub ? esc(t.sub) : "&nbsp;"}</div>
</td></tr>
</table>
</td>`
}

function rowHtml(label: string, value: string, strong = false): string {
  return `<tr>
<td style="padding:10px 0;border-bottom:1px solid ${LINE};font-family:${FONT};font-size:15px;line-height:1.4;color:${BODY};">${esc(label)}</td>
<td align="right" style="padding:10px 0;border-bottom:1px solid ${LINE};font-family:${FONT};font-size:15px;line-height:1.4;color:${INK};font-weight:${strong ? 700 : 600};white-space:nowrap;">${esc(value)}</td>
</tr>`
}

const h2 = (text: string) =>
  `<h2 style="margin:0 0 8px;font-family:${FONT};font-size:17px;line-height:1.4;font-weight:700;color:${INK};">${esc(text)}</h2>`

function paragraphs(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .trim()
    .split(/\n{2,}/)
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:1.6;color:${BODY};">${p
          .split("\n")
          .map(esc)
          .join("<br>")}</p>`
    )
    .join("\n")
}

export interface ReportRenderOptions {
  /** A personal message above the numbers. */
  note: string
  /** The AuraPixel logo (absolute URL in emails). */
  logoSrc: string
  /** AuraPixel's sign-off, from Settings → Email. */
  signature: string
}

export function renderReport(
  r: BlastReport,
  { note, logoSrc, signature }: ReportRenderOptions
): { subject: string; html: string; text: string } {
  const subject = `Email campaign report: ${r.campaign}`
  const when = period(r)
  const asOf = dateTime.format(new Date(r.generatedAt))
  const d = r.delivery
  const t = tiles(r)
  const grid = Array.from(
    { length: Math.ceil(t.length / 2) },
    (_, i) => `<tr>${tileHtml(t[i * 2])}${tileHtml(t[i * 2 + 1])}</tr>`
  ).join("\n")
  const share = sentShare(r)
  const bar =
    r.people > 0
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 6px;border-radius:999px;overflow:hidden;background:${LINE};">
<tr>${share > 0 ? `<td width="${share}%" height="10" style="height:10px;line-height:10px;font-size:0;background:${BLUE};">&nbsp;</td>` : ""}${share < 100 ? `<td height="10" style="height:10px;line-height:10px;font-size:0;">&nbsp;</td>` : ""}</tr>
</table>`
      : ""
  const listRows = listLines(r)
    .map(([a, b, strong]) => rowHtml(a, b, strong))
    .join("\n")
  const roundRows = roundLines(r)
    .map(([a, b]) => rowHtml(a, b))
    .join("\n")
  const meta = [when && `Sent ${when}`, r.from && `From ${r.from}`]
    .filter(Boolean)
    .map((s) => esc(s as string))
    .join("<br>")
  const sign = signature.trim()

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(subject)}</title>
<style>*{-webkit-print-color-adjust:exact;print-color-adjust:exact;}@media print{body,.outer{background:#ffffff !important;}.outer-pad{padding:0 !important;}}</style>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(`${n(r.sent)} emails sent${d ? `, ${n(d.delivered)} delivered` : ""}${when ? ` · ${when}` : ""}`)}${"&#847;&zwnj;&nbsp;".repeat(30)}</div>
<table role="presentation" class="outer" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;">
<tr><td class="outer-pad" align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;">
<tr><td bgcolor="${INK}" style="background:${INK};padding:28px 32px 24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle"><img src="${esc(logoSrc)}" width="132" alt="AuraPixel" style="display:block;width:132px;max-width:132px;height:auto;border:0;"></td>
<td valign="middle" align="right" style="font-family:${FONT};font-size:11px;line-height:1.5;letter-spacing:1.5px;text-transform:uppercase;color:#9fb4d6;">Email campaign<br>report</td>
</tr></table>
</td></tr>
<tr><td height="4" bgcolor="${BLUE}" style="height:4px;line-height:4px;font-size:0;background:${BLUE};background-image:linear-gradient(90deg,#0094ff,#0272e2,#0b49c4);">&nbsp;</td></tr>
<tr><td style="padding:28px 32px 8px;font-family:${FONT};">
${r.client ? `<div style="font-size:12px;line-height:1.5;letter-spacing:1px;text-transform:uppercase;color:${MUTED};padding-bottom:6px;">Prepared for ${esc(r.client)}</div>` : ""}
<h1 style="margin:0 0 10px;font-size:22px;line-height:1.3;font-weight:700;color:${INK};">${esc(r.campaign)}</h1>
${meta ? `<div style="font-size:14px;line-height:1.6;color:${MUTED};">${meta}</div>` : ""}
</td></tr>
${note.trim() ? `<tr><td style="padding:16px 32px 0;">${paragraphs(note)}</td></tr>` : ""}
<tr><td style="padding:12px 26px 8px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${grid}
</table>
</td></tr>
<tr><td style="padding:20px 32px 8px;">
${h2("The list")}
${bar}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${listRows}
</table>
</td></tr>
${
  roundRows
    ? `<tr><td style="padding:20px 32px 8px;">
${h2("Send rounds")}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${roundRows}
</table>
</td></tr>`
    : ""
}
<tr><td style="padding:24px 32px 28px;font-family:${FONT};">
<div style="border-top:1px solid ${LINE};padding-top:20px;font-size:14px;line-height:1.6;color:${BODY};">
<strong style="color:${INK};">Prepared by AuraPixel</strong>${sign ? `<br>${sign.split("\n").map(esc).join("<br>")}` : ""}
</div>
<div style="padding-top:12px;font-size:12px;line-height:1.6;color:${MUTED};">Figures as of ${esc(asOf)} (Malaysia time).</div>
</td></tr>
</table>
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
<tr><td style="padding:16px 24px;font-family:${FONT};font-size:12px;line-height:1.6;color:${MUTED};text-align:center;">
AuraPixel Creative Media Studio · <a href="https://www.aurapixel.live" style="color:${MUTED};text-decoration:underline;">aurapixel.live</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`

  const lines = (rows: [string, string][]) =>
    rows.map(([a, b]) => `${a}: ${b}`).join("\n")
  const text = [
    `AURAPIXEL · EMAIL CAMPAIGN REPORT`,
    [
      r.client && `Prepared for ${r.client}`,
      r.campaign,
      when && `Sent ${when}`,
      r.from && `From ${r.from}`,
    ]
      .filter(Boolean)
      .join("\n"),
    note.trim(),
    lines(t.map((x) => [x.label, x.sub ? `${x.value} (${x.sub})` : x.value])),
    lines(listLines(r).map(([a, b]) => [a, b])),
    r.rounds.length ? `Send rounds\n${lines(roundLines(r))}` : "",
    ["Prepared by AuraPixel", sign].filter(Boolean).join("\n"),
    `Figures as of ${asOf} (Malaysia time).`,
  ]
    .filter(Boolean)
    .join("\n\n")

  return { subject, html, text }
}

// ── Save as PDF: the same report laid out for an A4 page ───────────────────

/**
 * A full-page A4 document for the browser to print to PDF. The email is a
 * 600px column (what inboxes need); on paper that left half the page empty.
 * `@page { margin: 0 }` also leaves no room for the browser's own header and
 * footer (date, about:blank, page numbers), so the page is all ours.
 */
export function renderReportPdf(
  r: BlastReport,
  { note, logoSrc, signature }: ReportRenderOptions
): string {
  const when = period(r)
  const asOf = dateTime.format(new Date(r.generatedAt))
  const t = tiles(r)
  const cols = t.length <= 4 ? t.length : 3
  const sign = signature.trim()
  const title = [r.client, "Email campaign report", r.campaign]
    .filter(Boolean)
    .join(" - ")
  const rows = (lines: [string, string, boolean?][]) =>
    lines
      .map(
        ([a, b, strong]) =>
          `<tr><td>${esc(a)}</td><td class="num${strong ? " strong" : ""}">${esc(b)}</td></tr>`
      )
      .join("")
  const rounds = roundLines(r)

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
@page { size: A4; margin: 0; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { margin: 0; }
body { background: #d1d5db; font-family: ${FONT}; color: ${BODY}; }
.sheet { width: 210mm; min-height: 297mm; margin: 24px auto; background: #fff; box-shadow: 0 6px 30px rgba(0,0,0,.18); display: flex; flex-direction: column; }
.top { background: ${INK}; padding: 10mm 16mm 9mm; display: flex; align-items: center; justify-content: space-between; gap: 10mm; }
.top img { display: block; width: 38mm; height: auto; }
.kicker { text-align: right; color: #9fb4d6; font-size: 9pt; line-height: 1.5; letter-spacing: .2em; text-transform: uppercase; }
.kicker b { display: block; margin-top: 2mm; color: #fff; font-size: 10.5pt; font-weight: 600; letter-spacing: .02em; text-transform: none; }
.rule { height: 1.6mm; background: linear-gradient(90deg, #0094ff, #0272e2, #0b49c4); }
.content { flex: 1; padding: 9mm 16mm 0; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
.for { font-size: 9pt; letter-spacing: .16em; text-transform: uppercase; color: ${MUTED}; }
h1 { margin: 2.5mm 0 3mm; font-size: 21pt; line-height: 1.2; font-weight: 700; color: ${INK}; }
.meta { display: flex; flex-wrap: wrap; gap: 1.5mm 8mm; font-size: 10.5pt; color: ${MUTED}; }
.note { margin-top: 6mm; font-size: 11pt; line-height: 1.6; }
.note p { margin: 0 0 3mm; }
.tiles { display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: 4mm; margin-top: 8mm; break-inside: avoid; }
.tile { background: ${TILE}; border-radius: 3mm; padding: 4mm 5mm; border-top: 1mm solid ${BLUE}; }
.tile .label { font-size: 9.5pt; color: ${MUTED}; }
.tile .value { margin-top: 1mm; font-size: 22pt; line-height: 1.1; font-weight: 700; color: ${INK}; }
.tile .sub { margin-top: 1mm; min-height: 1.3em; font-size: 9.5pt; font-weight: 600; color: ${BLUE}; }
.cols { display: grid; grid-template-columns: ${rounds.length ? "1fr 1fr" : "1fr"}; gap: 12mm; margin-top: 9mm; }
tr, .bar { break-inside: avoid; }
h2 { break-after: avoid; }
h2 { margin: 0 0 3mm; font-size: 12.5pt; color: ${INK}; }
.bar { height: 2.4mm; margin-bottom: 1mm; border-radius: 99px; background: ${LINE}; overflow: hidden; }
.bar span { display: block; height: 100%; background: ${BLUE}; }
table { width: 100%; border-collapse: collapse; font-size: 10.5pt; }
td { padding: 2.2mm 0; border-bottom: .3mm solid ${LINE}; }
td.num { text-align: right; white-space: nowrap; font-weight: 600; color: ${INK}; }
td.strong { font-weight: 700; }
.foot { padding: 8mm 16mm 9mm; break-inside: avoid; }
.foot-in { padding-top: 5mm; border-top: .3mm solid ${LINE}; display: flex; justify-content: space-between; align-items: flex-end; gap: 10mm; font-size: 9.5pt; line-height: 1.6; }
.foot strong { color: ${INK}; }
.asof { text-align: right; color: ${MUTED}; }
@media print {
  body { background: #fff; }
  .sheet { margin: 0; box-shadow: none; display: block; min-height: 0; }
}
@media screen and (max-width: 840px) {
  .sheet { width: auto; min-height: 0; margin: 0; }
  .tiles { grid-template-columns: repeat(2, 1fr); }
  .cols { grid-template-columns: 1fr; }
}
</style>
</head>
<body>
<div class="sheet">
<div class="top">
<img src="${esc(logoSrc)}" alt="AuraPixel">
<div class="kicker">Email campaign report<b>${esc(dateOnly.format(new Date(r.generatedAt)))}</b></div>
</div>
<div class="rule"></div>
<div class="content">
${r.client ? `<div class="for">Prepared for ${esc(r.client)}</div>` : ""}
<h1>${esc(r.campaign)}</h1>
<div class="meta">${[when && `Sent ${when}`, r.from && `From ${r.from}`]
    .filter(Boolean)
    .map((x) => `<span>${esc(x as string)}</span>`)
    .join("")}</div>
${
  note.trim()
    ? `<div class="note">${note
        .replace(/\r\n?/g, "\n")
        .trim()
        .split(/\n{2,}/)
        .map((p) => `<p>${p.split("\n").map(esc).join("<br>")}</p>`)
        .join("")}</div>`
    : ""
}
<div class="tiles">${t
    .map(
      (x) =>
        `<div class="tile"><div class="label">${esc(x.label)}</div><div class="value">${esc(x.value)}</div><div class="sub">${esc(x.sub)}</div></div>`
    )
    .join("")}</div>
<div class="cols">
<section>
<h2>The list</h2>
${r.people ? `<div class="bar"><span style="width:${sentShare(r)}%"></span></div>` : ""}
<table>${rows(listLines(r))}</table>
</section>
${rounds.length ? `<section><h2>Send rounds</h2><table>${rows(rounds)}</table></section>` : ""}
</div>
</div>
<div class="foot"><div class="foot-in">
<div><strong>Prepared by AuraPixel</strong>${sign ? `<br>${sign.split("\n").map(esc).join("<br>")}` : ""}</div>
<div class="asof">Figures as of ${esc(asOf)}<br>(Malaysia time)</div>
</div></div>
</div>
</body>
</html>`
}

// ── The list of people (CSV attachment) ────────────────────────────────────

function csvCell(v: string): string {
  // A cell starting with = + - @ would run as a formula in Excel.
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export function reportCsv(rows: ReportRow[]): string {
  const lines = [["Email", "Name", "Status", "Sent (Malaysia time)"]]
  for (const r of rows)
    lines.push([
      r.email,
      r.name === "there" ? "" : r.name,
      r.status,
      r.sentAt ? dateTime.format(r.sentAt) : "",
    ])
  return `${lines.map((l) => l.map(csvCell).join(",")).join("\r\n")}\r\n`
}

// ── Who it goes to ─────────────────────────────────────────────────────────

export const REPORT_TO_MAX = 10
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i

/** "a@x.com, b@y.com" → the addresses, or what's wrong with them. */
export function parseReportTo(
  raw: unknown
): { ok: true; to: string[] } | { ok: false; error: string } {
  const parts = String(raw ?? "")
    .split(/[\s,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  const to = [...new Set(parts)]
  if (!to.length) return { ok: false, error: "Enter who to send it to." }
  const bad = to.find((e) => !EMAIL_RE.test(e))
  if (bad) return { ok: false, error: `“${bad}” isn’t a full email address.` }
  if (to.length > REPORT_TO_MAX)
    return { ok: false, error: `Send to at most ${REPORT_TO_MAX} addresses.` }
  return { ok: true, to }
}
