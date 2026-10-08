// Dates in the team's timezone, whatever the viewer's laptop is set to.
const TZ = "Asia/Kuala_Lumpur"

const dateTime = new Intl.DateTimeFormat("en-MY", {
  timeZone: TZ,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

export function formatDateTime(d: Date | null): string {
  return d ? dateTime.format(d) : "—"
}

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" })

export function formatRelative(d: Date | null, now = Date.now()): string {
  if (!d) return "—"
  const seconds = Math.round((d.getTime() - now) / 1000)
  const abs = Math.abs(seconds)
  if (abs < 45) return "just now"
  if (abs < 3600) return relative.format(Math.round(seconds / 60), "minute")
  if (abs < 86400) return relative.format(Math.round(seconds / 3600), "hour")
  if (abs < 86400 * 7)
    return relative.format(Math.round(seconds / 86400), "day")
  return formatDateTime(d)
}

/** 60123456789 → +60 12-345 6789 for display; other numbers get a plain "+". */
export function formatPhone(phone: string): string {
  const m = phone.match(/^60(1\d)(\d{3,4})(\d{4})$/)
  if (m) return `+60 ${m[1]}-${m[2]} ${m[3]}`
  return /^\d+$/.test(phone) ? `+${phone}` : phone
}
