"use client"

// Settings → Clients: companies AuraPixel sends email for, each with its own
// sender details and Resend account. A blast tagged with a client sends
// through that client's Resend. Keys are write-only here.

import {
  BuildingIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react"
import * as React from "react"
import type { ConnectionStatus } from "@/app/api/settings/status/route"
import { ConfirmDialog, DialogShell } from "@/components/common/dialog-shell"
import { EmptyState } from "@/components/common/empty-state"
import { AreaField, TextField } from "@/components/settings/form-bits"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import {
  PasswordInput,
  PasswordInputGroup,
  PasswordInputInput,
  PasswordInputTrigger,
} from "@/components/ui/password-input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { useClients } from "@/hooks/use-clients"
import { ApiError, apiPost } from "@/lib/api"
import {
  CLIENT_FOOTER_MAX,
  type ClientDetails,
  type ClientField,
  type ClientProfile,
  validateClient,
} from "@/lib/clients"

type Dialog =
  | { kind: "add" }
  | { kind: "edit"; client: ClientProfile }
  | { kind: "delete"; client: ClientProfile }
  | null

export function ClientsSettings() {
  const { data: clients, loading, error } = useClients()
  const [status, setStatus] = React.useState<ConnectionStatus | null>(null)
  const [dialog, setDialog] = React.useState<Dialog>(null)

  React.useEffect(() => {
    apiPost<ConnectionStatus>("/api/settings/status", {})
      .then(setStatus)
      .catch(() => {})
  }, [])

  const addButton = (
    <Button size="xl" onClick={() => setDialog({ kind: "add" })}>
      <PlusIcon />
      Add client
    </Button>
  )

  return (
    <div className="flex flex-col gap-5 pb-8">
      {status && !status.secrets && (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertDescription>
            Run <code className="font-mono">npm run setup:secrets</code> in
            ap-ops once before adding Resend keys.
          </AlertDescription>
        </Alert>
      )}
      {error && <p className="text-sm text-destructive-foreground">{error}</p>}
      {loading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 2 }, (_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : clients.length === 0 ? (
        <EmptyState
          icon={BuildingIcon}
          title="No clients yet"
          action={addButton}
        />
      ) : (
        <>
          <div className="flex justify-end">{addButton}</div>
          <ul className="grid gap-3 md:grid-cols-2">
            {clients.map((c) => (
              <ClientCard
                key={c.id}
                client={c}
                onEdit={() => setDialog({ kind: "edit", client: c })}
                onDelete={() => setDialog({ kind: "delete", client: c })}
              />
            ))}
          </ul>
        </>
      )}

      {(dialog?.kind === "add" || dialog?.kind === "edit") && (
        <ClientDialog
          client={dialog.kind === "edit" ? dialog.client : null}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === "delete" && (
        <ConfirmDialog
          open
          onClose={() => setDialog(null)}
          title={`Delete ${dialog.client.name}?`}
          body="Its Resend key is removed from Ops."
          confirmLabel="Delete client"
          destructive
          onConfirm={async () => {
            await apiPost("/api/clients/delete", { id: dialog.client.id })
            toast.success({ title: `${dialog.client.name} deleted` })
            setDialog(null)
          }}
        />
      )}
    </div>
  )
}

function ClientCard({
  client: c,
  onEdit,
  onDelete,
}: {
  client: ClientProfile
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <li className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="min-w-0">
        <p className="truncate font-medium">{c.name}</p>
        {c.fromEmail && (
          <p className="truncate text-sm text-muted-foreground">
            {c.fromName ? `${c.fromName} <${c.fromEmail}>` : c.fromEmail}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {c.resend.connected ? (
          <>
            <Badge variant="success">Resend connected</Badge>
            {c.resend.restricted ? (
              <Badge variant="outline">Sending-only key</Badge>
            ) : (
              c.resend.domains.map((d) => (
                <Badge key={d} variant="outline">
                  {d}
                </Badge>
              ))
            )}
            <span className="text-xs text-muted-foreground">
              Key …{c.resend.last4}
            </span>
          </>
        ) : (
          <Badge variant="warning">No Resend key</Badge>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="lg"
          className="min-h-10"
          onClick={onEdit}
        >
          <PencilIcon />
          Edit
        </Button>
        <Button
          variant="ghost"
          size="lg"
          className="min-h-10"
          onClick={onDelete}
        >
          <Trash2Icon />
          Delete
        </Button>
      </div>
    </li>
  )
}

function ClientDialog({
  client,
  onClose,
}: {
  client: ClientProfile | null
  onClose: () => void
}) {
  const [v, setV] = React.useState<ClientDetails>({
    name: client?.name ?? "",
    fromName: client?.fromName ?? "",
    fromEmail: client?.fromEmail ?? "",
    replyTo: client?.replyTo ?? "",
    footer: client?.footer ?? "",
  })
  const [key, setKey] = React.useState("")
  const [removeKey, setRemoveKey] = React.useState(false)
  const [errors, setErrors] = React.useState<
    Partial<Record<ClientField, string>>
  >({})
  const [formError, setFormError] = React.useState<string>()
  const [busy, setBusy] = React.useState(false)
  const connected = Boolean(client?.resend.connected) && !removeKey

  function set<K extends keyof ClientDetails>(k: K, value: string) {
    setV((x) => ({ ...x, [k]: value }))
    setErrors((e) => ({ ...e, [k]: undefined }))
  }

  async function save() {
    const checked = validateClient(v)
    if (!checked.ok) {
      setErrors(checked.errors)
      return
    }
    setBusy(true)
    setFormError(undefined)
    try {
      await apiPost("/api/clients/save", {
        id: client?.id,
        ...checked.client,
        resendKey: key.trim() || undefined,
        removeKey: removeKey && !key.trim(),
      })
      toast.success({ title: `${checked.client.name} saved` })
      onClose()
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.fields).length)
        setErrors(e.fields as Partial<Record<ClientField, string>>)
      else setFormError(e instanceof Error ? e.message : "It didn’t save.")
      setBusy(false)
    }
  }

  return (
    <DialogShell
      open
      onClose={onClose}
      title={client ? `Edit ${client.name}` : "Add client"}
      footer={
        <>
          <Button variant="outline" size="xl" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button size="xl" onClick={() => void save()} disabled={busy}>
            {busy && <Spinner />}
            Save
          </Button>
        </>
      }
    >
      <TextField
        label="Client name"
        value={v.name}
        onChange={(x) => set("name", x)}
        error={errors.name}
        placeholder="ThinkTx"
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="Sender name"
          value={v.fromName}
          onChange={(x) => set("fromName", x)}
          error={errors.fromName}
          placeholder="ThinkTx"
        />
        <TextField
          label="Sender email"
          type="email"
          inputMode="email"
          value={v.fromEmail}
          onChange={(x) => set("fromEmail", x)}
          error={errors.fromEmail}
          placeholder="info@thinktx.my"
        />
      </div>
      <TextField
        label="Replies go to (optional)"
        type="email"
        inputMode="email"
        value={v.replyTo}
        onChange={(x) => set("replyTo", x)}
        error={errors.replyTo}
      />
      <AreaField
        label="Small print"
        rows={3}
        value={v.footer}
        onChange={(x) => set("footer", x)}
        error={errors.footer}
        max={CLIENT_FOOTER_MAX}
      />
      <Field invalid={Boolean(errors.resendKey)}>
        <FieldLabel>Resend API key</FieldLabel>
        <PasswordInput size="lg">
          <PasswordInputGroup className="h-10">
            <PasswordInputInput
              autoComplete="off"
              spellCheck={false}
              value={key}
              placeholder={
                connected ? `Saved, ends in ${client?.resend.last4}` : "re_…"
              }
              onChange={(e) => {
                setKey(e.target.value)
                setErrors((x) => ({ ...x, resendKey: undefined }))
              }}
            />
            <PasswordInputTrigger aria-label="Show or hide the key" />
          </PasswordInputGroup>
        </PasswordInput>
        <FieldError>{errors.resendKey}</FieldError>
      </Field>
      {client?.resend.connected && (
        <Button
          variant={removeKey ? "destructive" : "ghost"}
          size="lg"
          className="min-h-10 self-start"
          onClick={() => setRemoveKey((x) => !x)}
        >
          <Trash2Icon />
          {removeKey ? "Key will be removed on Save" : "Remove saved key"}
        </Button>
      )}
      {formError && (
        <p className="text-sm text-destructive-foreground">{formError}</p>
      )}
    </DialogShell>
  )
}
