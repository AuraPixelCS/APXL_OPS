"use client"

// One email blast: who it goes to (Recipients) and what it says (Email).

import {
  ArrowLeftIcon,
  ListChecksIcon,
  MailIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react"
import Link from "next/link"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import * as React from "react"
import { EmailTab } from "@/components/blasts/email-tab"
import { RecipientsTab } from "@/components/blasts/recipients-tab"
import { SheetPicker } from "@/components/blasts/sheet-picker"
import { useBlastEmailForm } from "@/components/blasts/use-blast-email-form"
import { ConfirmDialog, DialogShell } from "@/components/common/dialog-shell"
import { EmptyState } from "@/components/common/empty-state"
import { StatTile } from "@/components/common/stat-tile"
import { TextField } from "@/components/settings/form-bits"
import { AppShell } from "@/components/shell/app-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/components/ui/toast"
import {
  useBlast,
  useRecipients,
  useSheetLeads,
  useUnsubscribes,
} from "@/hooks/use-blasts"
import { useSheets } from "@/hooks/use-sheets"
import { ApiError, apiPost } from "@/lib/api"
import { buildRows, countByStatus } from "@/lib/blasts/recipients"
import type { Blast } from "@/lib/blasts/types"

type Tab = "recipients" | "email"
type Dialog = "rename" | "sheets" | "delete" | null

const SHOWN_SHEETS = 4

export function BlastPage() {
  const { id } = useParams<{ id: string }>()
  const params = useSearchParams()
  const { data: blast, loading, error } = useBlast(id)
  const { data: sheets } = useSheets()
  const sheetsById = React.useMemo(
    () => new Map(sheets.map((s) => [s.id, s])),
    [sheets]
  )
  const audience = useSheetLeads(blast?.sheetIds ?? [])
  const { data: recipients } = useRecipients(id)
  const { data: unsubscribed } = useUnsubscribes()
  const form = useBlastEmailForm(blast)
  const [tab, setTab] = React.useState<Tab | null>(
    params.get("tab") === "email" ? "email" : null
  )
  const [dialog, setDialog] = React.useState<Dialog>(null)

  const rows = React.useMemo(
    () => buildRows(audience.data, recipients, unsubscribed),
    [audience.data, recipients, unsubscribed]
  )
  const counts = countByStatus(rows)
  const people = rows.filter(
    (r) => r.status !== "cant_email" && !r.outside
  ).length
  const activeTab: Tab =
    tab ?? (blast && !blast.email.subject ? "email" : "recipients")
  const sampleName =
    audience.data.find((l) => l.emailOk && l.greetingName !== "there")
      ?.greetingName ?? ""

  if (!loading && !blast) {
    return (
      <AppShell title="Email blast">
        <div className="page-x py-6">
          <EmptyState
            icon={MailIcon}
            title={
              error ? "Couldn’t load this blast" : "This blast no longer exists"
            }
            body={error ?? "It may have been deleted."}
            action={
              <Button asChild size="xl" variant="outline">
                <Link href="/blasts">All email blasts</Link>
              </Button>
            }
          />
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell
      title={blast?.name ?? "Email blast"}
      actions={blast && <BlastMenu onPick={setDialog} />}
    >
      <div className="flex flex-col gap-5 page-x pt-4 pb-5 sm:pt-5">
        <div className="flex flex-col gap-2">
          <Link
            href="/blasts"
            className="-ms-1 inline-flex min-h-10 items-center gap-1.5 self-start rounded-md px-1 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            <ArrowLeftIcon className="size-4" aria-hidden />
            Email blasts
          </Link>
          {loading || !blast ? (
            <Skeleton className="h-8 w-64 rounded-lg" />
          ) : (
            <>
              <h1 className="font-heading text-xl font-semibold tracking-tight break-words">
                {blast.name}
              </h1>
              <div className="flex flex-wrap items-center gap-1.5">
                {blast.sheetIds.slice(0, SHOWN_SHEETS).map((sid) => {
                  const s = sheetsById.get(sid)
                  return (
                    <Badge key={sid} variant="outline" className="max-w-full">
                      <span className="truncate">
                        {s ? `${s.title} · ${s.client}` : "Deleted sheet"}
                      </span>
                    </Badge>
                  )
                })}
                {blast.sheetIds.length > SHOWN_SHEETS && (
                  <Badge variant="outline">
                    +{blast.sheetIds.length - SHOWN_SHEETS} more
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="lg"
                  className="min-h-10 text-muted-foreground"
                  onClick={() => setDialog("sheets")}
                >
                  Change
                </Button>
              </div>
            </>
          )}
        </div>

        <section
          aria-label="Blast counts"
          className="grid grid-cols-2 gap-3 lg:grid-cols-4"
        >
          <StatTile
            label="People"
            value={audience.loading ? "–" : people.toLocaleString()}
            hint={
              counts.cant_email
                ? `${counts.cant_email} more without an email`
                : undefined
            }
          />
          <StatTile
            label="Sent"
            value={audience.loading ? "–" : counts.sent.toLocaleString()}
            tone="brand"
          />
          <StatTile
            label="Left to send"
            value={
              audience.loading
                ? "–"
                : (counts.not_sent + counts.failed).toLocaleString()
            }
            hint={
              counts.failed ? `${counts.failed} failed, can retry` : undefined
            }
          />
          <StatTile
            label="Unsubscribed"
            value={
              audience.loading ? "–" : counts.unsubscribed.toLocaleString()
            }
            tone="muted"
          />
        </section>

        <Tabs
          value={activeTab}
          onValueChange={(d) => setTab(d.value as Tab)}
          className="flex flex-col"
        >
          <TabsList
            variant="underline"
            className="max-w-full [scrollbar-width:none] justify-start overflow-x-auto [&::-webkit-scrollbar]:hidden"
          >
            <TabsTrigger value="recipients" className="min-h-11 px-3">
              <ListChecksIcon />
              Recipients
            </TabsTrigger>
            <TabsTrigger value="email" className="min-h-11 px-3">
              <MailIcon />
              Email
              {form.dirty && (
                <span
                  className="size-1.5 rounded-full bg-warning"
                  aria-label="unsaved changes"
                />
              )}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="recipients" className="pt-5">
            {blast && (
              <RecipientsTab
                blast={blast}
                rows={rows}
                counts={counts}
                loading={audience.loading}
                sheetsById={sheetsById}
                form={form}
                onEditEmail={() => setTab("email")}
              />
            )}
          </TabsContent>
          <TabsContent value="email" className="pt-5">
            {blast && (
              <EmailTab blast={blast} form={form} sampleName={sampleName} />
            )}
          </TabsContent>
        </Tabs>
      </div>

      {blast && dialog === "rename" && (
        <RenameDialog blast={blast} onClose={() => setDialog(null)} />
      )}
      {blast && dialog === "sheets" && (
        <SheetsDialog
          blast={blast}
          sheets={sheets}
          onClose={() => setDialog(null)}
        />
      )}
      {blast && dialog === "delete" && (
        <DeleteDialog blast={blast} onClose={() => setDialog(null)} />
      )}
    </AppShell>
  )
}

function BlastMenu({ onPick }: { onPick: (d: Dialog) => void }) {
  return (
    <Menu onSelect={(d) => onPick(d.value as Dialog)}>
      <MenuTrigger asChild>
        <Button variant="outline" size="icon-xl" aria-label="Blast options">
          <MoreHorizontalIcon />
        </Button>
      </MenuTrigger>
      <MenuContent className="min-w-52">
        <MenuItem value="rename">
          <PencilIcon />
          Rename
        </MenuItem>
        <MenuItem value="sheets">
          <ListChecksIcon />
          Change sheets
        </MenuItem>
        <MenuSeparator />
        <MenuItem value="delete" variant="destructive">
          <Trash2Icon />
          Delete blast
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}

function RenameDialog({
  blast,
  onClose,
}: {
  blast: Blast
  onClose: () => void
}) {
  const [name, setName] = React.useState(blast.name)
  const [error, setError] = React.useState<string>()
  const [busy, setBusy] = React.useState(false)
  async function save() {
    setBusy(true)
    try {
      await apiPost("/api/blasts/update", { id: blast.id, name })
      toast.success({ title: "Blast renamed" })
      onClose()
    } catch (e) {
      setError(
        e instanceof ApiError
          ? (e.fields.name ?? e.message)
          : "Couldn't rename it."
      )
      setBusy(false)
    }
  }
  return (
    <DialogShell
      open
      onClose={onClose}
      title="Rename blast"
      footer={
        <>
          <Button variant="outline" size="xl" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button size="xl" onClick={save} disabled={busy}>
            {busy && <Spinner />}
            Save
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <TextField label="Name" value={name} onChange={setName} error={error} />
      </form>
    </DialogShell>
  )
}

function SheetsDialog({
  blast,
  sheets,
  onClose,
}: {
  blast: Blast
  sheets: Parameters<typeof SheetPicker>[0]["sheets"]
  onClose: () => void
}) {
  const [ids, setIds] = React.useState(
    blast.sheetIds.filter((id) => sheets.some((s) => s.id === id))
  )
  const [error, setError] = React.useState<string>()
  const [busy, setBusy] = React.useState(false)
  async function save() {
    if (!ids.length) return setError("Pick at least one sheet.")
    setBusy(true)
    try {
      await apiPost("/api/blasts/update", { id: blast.id, sheetIds: ids })
      toast.success({ title: "Sheets updated" })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.")
      setBusy(false)
    }
  }
  return (
    <DialogShell
      open
      onClose={onClose}
      title="Change sheets"
      description="Add a new month's sheet to keep sending from the same blast. Removing a sheet doesn't undo anything: people already sent to stay in the Sent list."
      footer={
        <>
          <Button variant="outline" size="xl" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button size="xl" onClick={save} disabled={busy}>
            {busy && <Spinner />}
            Save
          </Button>
        </>
      }
    >
      <SheetPicker
        sheets={sheets}
        value={ids}
        onChange={(v) => {
          setIds(v)
          setError(undefined)
        }}
        error={error}
      />
    </DialogShell>
  )
}

function DeleteDialog({
  blast,
  onClose,
}: {
  blast: Blast
  onClose: () => void
}) {
  const router = useRouter()
  return (
    <ConfirmDialog
      open
      onClose={onClose}
      title={`Delete “${blast.name}”?`}
      body="Its email and the record of who it was sent to are deleted. Leads and sheets stay, and people who unsubscribed stay unsubscribed. This can't be undone."
      confirmLabel="Delete blast"
      destructive
      onConfirm={async () => {
        await apiPost("/api/blasts/delete", { id: blast.id })
        toast.success({ title: "Blast deleted" })
        onClose()
        router.replace("/blasts")
      }}
    />
  )
}
