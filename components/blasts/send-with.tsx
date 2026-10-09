"use client"

// "Sends with": which Resend account a blast goes out through, AuraPixel's
// own or a client's (Settings → Clients). Picking one fills in its sender
// details. Shown only once there's a client to pick.

import { createListCollection } from "@ark-ui/react/collection"
import * as React from "react"
import type { BlastEmailForm } from "@/components/blasts/use-blast-email-form"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useClients } from "@/hooks/use-clients"
import { useSettings } from "@/hooks/use-settings"
import { canSendFrom, type ClientProfile } from "@/lib/clients"

/** Ark Select can't hold "", so AuraPixel's own account is this value. */
const OWN = "aurapixel"

export function ClientSelect({
  clients,
  value,
  onChange,
  error,
}: {
  clients: ClientProfile[]
  value: string
  onChange: (clientId: string) => void
  error?: string
}) {
  const collection = React.useMemo(
    () =>
      createListCollection({
        items: [
          { value: OWN, label: "AuraPixel" },
          ...clients.map((c) => ({ value: c.id, label: c.name })),
        ],
      }),
    [clients]
  )
  return (
    <Field invalid={Boolean(error)}>
      <FieldLabel>Sends with</FieldLabel>
      <Select
        collection={collection}
        value={[value || OWN]}
        onValueChange={(d) => {
          const v = d.value[0]
          if (v) onChange(v === OWN ? "" : v)
        }}
        positioning={{ sameWidth: true }}
      >
        <SelectTrigger size="lg" className="h-10 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {collection.items.map((item) => (
            <SelectItem key={item.value} item={item}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldError>{error}</FieldError>
    </Field>
  )
}

/** Why a blast can't send with `client` as it stands, if it can't. */
export function clientProblem(
  client: ClientProfile | undefined,
  fromEmail: string
): string | undefined {
  if (!client) return undefined
  if (!client.resend.connected)
    return `${client.name} has no Resend key yet (Settings → Clients).`
  if (fromEmail && !canSendFrom(client.resend, fromEmail))
    return `${client.name}'s Resend sends from ${client.resend.domains.join(", ")}.`
  return undefined
}

/** The Email tab's field: switching also swaps in that sender's details. */
export function SendWithField({ form }: { form: BlastEmailForm }) {
  const { data: clients } = useClients()
  const { values: own } = useSettings("email")
  const { values: v, set, errors } = form
  if (!clients.length && !v.clientId) return null
  const client = clients.find((c) => c.id === v.clientId)

  function pick(clientId: string) {
    set("clientId", clientId)
    const c = clients.find((x) => x.id === clientId)
    const details = c
      ? {
          fromName: c.fromName,
          fromEmail: c.fromEmail,
          replyTo: c.replyTo,
          footer: c.footer,
        }
      : {
          fromName: own.senderName,
          fromEmail: own.address,
          replyTo: "",
          footer: own.signature,
        }
    for (const k of ["fromName", "fromEmail", "replyTo", "footer"] as const)
      if (details[k] || k === "replyTo") set(k, details[k])
  }

  return (
    <ClientSelect
      clients={clients}
      value={v.clientId}
      onChange={pick}
      error={errors.clientId ?? clientProblem(client, v.fromEmail)}
    />
  )
}
