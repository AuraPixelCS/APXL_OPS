"use client"

import {
  ArrowLeftIcon,
  BuildingIcon,
  CheckIcon,
  CopyIcon,
  MailIcon,
  MessageSquareTextIcon,
  PhoneIcon,
  SearchXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import * as React from "react"
import { EmptyState } from "@/components/common/empty-state"
import {
  FLAG_LABELS,
  ScoreBadge,
  StatusBadge,
} from "@/components/leads/lead-badges"
import { AppShell } from "@/components/shell/app-shell"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { useLead } from "@/hooks/use-leads"
import { formatDateTime, formatPhone } from "@/lib/format"
import type { Lead } from "@/lib/leads/types"

export function LeadDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: lead, loading, error } = useLead(id)

  return (
    <AppShell
      title={
        <span className="flex items-center gap-1.5">
          <Link
            href="/leads"
            className="text-muted-foreground hover:text-foreground"
          >
            Leads
          </Link>
          <span className="text-muted-foreground" aria-hidden>
            /
          </span>
          <span className="truncate">
            {lead?.name ?? (loading ? "" : "Not found")}
          </span>
        </span>
      }
    >
      <div className="flex flex-col gap-5 page-x py-5 sm:py-6">
        {error ? (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>Couldn&rsquo;t load this lead</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : loading ? (
          <div
            className="flex flex-col gap-4"
            role="status"
            aria-label="Loading lead"
          >
            <Skeleton className="h-16 w-full max-w-lg rounded-xl" />
            <Skeleton className="h-72 w-full rounded-xl" />
          </div>
        ) : !lead ? (
          <EmptyState
            icon={SearchXIcon}
            title="This lead doesn't exist"
            body="It may have been removed, or the link is wrong."
            action={
              <Button asChild variant="outline" size="xl">
                <Link href="/leads">
                  <ArrowLeftIcon />
                  Back to leads
                </Link>
              </Button>
            }
          />
        ) : (
          <LeadView lead={lead} />
        )}
      </div>
    </AppShell>
  )
}

function LeadView({ lead }: { lead: Lead }) {
  const answers = Object.entries(lead.extra)
  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl font-semibold tracking-tight break-words">
          {lead.name || "Unnamed"}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={lead.status} />
          <ScoreBadge score={lead.score} />
          {lead.workEmail && (
            <Badge variant="outline">
              <BuildingIcon aria-hidden />
              Company email
            </Badge>
          )}
        </div>
        {lead.scoreReason && (
          <p className="text-sm text-muted-foreground">{lead.scoreReason}</p>
        )}
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
        <Card className="lg:min-h-80">
          <CardHeader title="Conversation" />
          <CardContent className="flex flex-1 flex-col">
            <EmptyState
              icon={MessageSquareTextIcon}
              title="No emails yet"
              body={
                lead.emailOk
                  ? `The email thread with ${lead.greetingName} will appear here, with the assistant’s draft replies waiting for your approval.`
                  : "This lead has no usable email address, so there won’t be an email conversation."
              }
              className="flex-1 border-none"
            />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Contact" />
            <CardContent className="flex flex-col gap-3">
              <ContactRow
                icon={MailIcon}
                label="Email"
                value={lead.email}
                copy={lead.emailOk}
              />
              <ContactRow
                icon={PhoneIcon}
                label="Phone"
                value={lead.phone ? formatPhone(lead.phone) : ""}
                copy
              />
              <Separator />
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">WhatsApp</dt>
                <dd>{lead.whatsappOk ? "Can receive" : "Not possible"}</dd>
                <dt className="text-muted-foreground">Emails say</dt>
                <dd>Hi {lead.greetingName}</dd>
                <dt className="text-muted-foreground">Added</dt>
                <dd>{formatDateTime(lead.createdAt)}</dd>
                <dt className="text-muted-foreground">From</dt>
                <dd className="break-all">{lead.source.fileName || "—"}</dd>
              </dl>
            </CardContent>
          </Card>

          {lead.flags.length > 0 && (
            <Card>
              <CardHeader title="Worth checking" />
              <CardContent>
                <ul className="flex flex-col gap-2 text-sm">
                  {lead.flags.map((f) => (
                    <li key={f} className="flex gap-2">
                      <TriangleAlertIcon
                        className="mt-0.5 size-4 shrink-0 text-warning"
                        aria-hidden
                      />
                      <span>{FLAG_LABELS[f]}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {answers.length > 0 && (
            <Card>
              <CardHeader
                title="From the form"
                description="Other columns in the CSV, as the lead entered them."
              />
              <CardContent>
                <dl className="flex flex-col gap-3 text-sm">
                  {answers.map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-xs text-muted-foreground">
                        {k.replace(/_/g, " ")}
                      </dt>
                      <dd className="break-words">{v}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}

function ContactRow({
  icon: Icon,
  label,
  value,
  copy,
}: {
  icon: typeof MailIcon
  label: string
  value: string
  copy?: boolean
}) {
  const [copied, setCopied] = React.useState(false)
  return (
    <div className="flex items-center gap-3">
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm">{value || "—"}</p>
      </div>
      {copy && value && (
        <Button
          variant="ghost"
          size="icon-xl"
          aria-label={`Copy ${label.toLowerCase()}`}
          onClick={async () => {
            await navigator.clipboard.writeText(value)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </Button>
      )}
    </div>
  )
}
