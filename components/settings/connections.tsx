"use client"

import {
  BotIcon,
  DatabaseIcon,
  InboxIcon,
  SendIcon,
  WorkflowIcon,
} from "lucide-react"
import * as React from "react"
import type { ConnectionStatus } from "@/app/api/settings/status/route"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useSettings } from "@/hooks/use-settings"
import { apiPost } from "@/lib/api"

type Row = {
  icon: typeof DatabaseIcon
  name: string
  detail: React.ReactNode
  state: "ok" | "missing" | "waiting"
  stateLabel: string
}

const BADGE = {
  ok: "success",
  missing: "secondary",
  waiting: "outline",
} as const

export function Connections() {
  const [status, setStatus] = React.useState<ConnectionStatus | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const email = useSettings("email")

  React.useEffect(() => {
    apiPost<ConnectionStatus>("/api/settings/status", {})
      .then(setStatus)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Couldn't check connections.")
      )
  }, [])

  if (error)
    return <p className="text-sm text-destructive-foreground">{error}</p>
  if (!status) {
    return (
      <div
        className="flex flex-col gap-2"
        role="status"
        aria-label="Checking connections"
      >
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    )
  }

  const rows: Row[] = [
    {
      icon: DatabaseIcon,
      name: "Database",
      detail: `Firebase project ${status.database.projectId ?? "(unknown)"}, Singapore.`,
      state: "ok",
      stateLabel: "Connected",
    },
    {
      icon: BotIcon,
      name: "Assistant (Claude)",
      detail: status.assistant
        ? "Drafts replies and scores leads."
        : "Needs an Anthropic API key in the server settings (ANTHROPIC_API_KEY).",
      state: status.assistant ? "ok" : "missing",
      stateLabel: status.assistant ? "Ready" : "Not set up",
    },
    {
      icon: WorkflowIcon,
      name: "n8n",
      detail: status.n8n
        ? "Ops can hand emails to n8n to send."
        : "Needs the n8n webhook address and a shared secret (N8N_WEBHOOK_URL, OPS_WEBHOOK_SECRET).",
      state: status.n8n ? "ok" : "missing",
      stateLabel: status.n8n ? "Connected" : "Not set up",
    },
    {
      icon: SendIcon,
      name: "Sending email (Resend)",
      detail: "Set up inside n8n with a Resend API key for aurapixel.live.",
      state: "waiting",
      stateLabel: status.n8n ? "Set up in n8n" : "After n8n",
    },
    {
      icon: InboxIcon,
      name: "Reply mailbox",
      detail: (
        <>
          n8n reads replies from{" "}
          <span className="text-foreground">{email.values.address}</span>{" "}
          (GoDaddy) using the mailbox password, entered in n8n.
        </>
      ),
      state: "waiting",
      stateLabel: status.n8n ? "Set up in n8n" : "After n8n",
    },
  ]

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Keys and passwords never go in Ops settings. They live on the server and
        in n8n; this page only shows whether each piece is in place.
      </p>
      <ul className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card">
        {rows.map((r) => (
          <li key={r.name} className="flex items-start gap-4 px-5 py-4">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
              <r.icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{r.name}</p>
              <p className="text-sm text-muted-foreground">{r.detail}</p>
            </div>
            <Badge variant={BADGE[r.state]} className="mt-0.5 shrink-0">
              {r.stateLabel}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  )
}
