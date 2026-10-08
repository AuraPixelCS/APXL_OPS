import { FlameIcon, SnowflakeIcon, SunIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { LeadFlag, LeadScore, LeadStatus } from "@/lib/leads/types"

const STATUS: Record<
  LeadStatus,
  {
    label: string
    variant: "secondary" | "info" | "warning" | "success" | "outline"
  }
> = {
  new: { label: "Not contacted", variant: "secondary" },
  emailed: { label: "Emailed", variant: "info" },
  replied: { label: "Replied", variant: "warning" },
  booked: { label: "Booked", variant: "success" },
  closed: { label: "Closed", variant: "outline" },
}

export function StatusBadge({ status }: { status: LeadStatus }) {
  const s = STATUS[status] ?? STATUS.new
  return <Badge variant={s.variant}>{s.label}</Badge>
}

const SCORE: Record<
  LeadScore,
  {
    label: string
    variant: "warning" | "info" | "secondary"
    icon: typeof FlameIcon
  }
> = {
  hot: { label: "Hot", variant: "warning", icon: FlameIcon },
  warm: { label: "Warm", variant: "info", icon: SunIcon },
  cold: { label: "Cold", variant: "secondary", icon: SnowflakeIcon },
}

export function ScoreBadge({ score }: { score: LeadScore | null }) {
  if (!score)
    return <span className="text-sm text-muted-foreground">Not scored</span>
  const s = SCORE[score]
  return (
    <Badge variant={s.variant}>
      <s.icon aria-hidden />
      {s.label}
    </Badge>
  )
}

/** Plain-language explanation of each cleaning flag. */
export const FLAG_LABELS: Record<LeadFlag, string> = {
  name_unusable: "Name looks fake, so emails will say “Hi there”",
  email_missing: "No email address",
  email_invalid: "Email address isn’t valid",
  email_multiple: "Gave more than one email; using the first",
  email_suspicious: "Email address looks made up",
  phone_missing: "No phone number",
  phone_invalid: "Phone number isn’t valid",
  phone_landline: "Landline, so no WhatsApp",
  phone_foreign: "Phone number isn’t Malaysian",
}

export const FLAG_SHORT: Record<LeadFlag, string> = {
  name_unusable: "Fake name",
  email_missing: "No email",
  email_invalid: "Bad email",
  email_multiple: "Two emails",
  email_suspicious: "Made-up email",
  phone_missing: "No phone",
  phone_invalid: "Bad phone",
  phone_landline: "Landline",
  phone_foreign: "Foreign phone",
}
