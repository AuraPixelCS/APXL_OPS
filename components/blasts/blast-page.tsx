"use client"

// One email blast: who it goes to (Recipients) and what it says (Email).

import {
  ArrowLeftIcon,
  FileChartColumnIcon,
  FileUpIcon,
  ListChecksIcon,
  MailIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
  UserPlusIcon,
} from "lucide-react"
import Link from "next/link"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import * as React from "react"
import { AddPersonDialog } from "@/components/blasts/add-person-dialog"
import { EmailTab } from "@/components/blasts/email-tab"
import { ListUpload, type PickedList } from "@/components/blasts/list-upload"
import { RecipientsTab } from "@/components/blasts/recipients-tab"
import { ReportDialog } from "@/components/blasts/report-dialog"
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
  useBlastLists,
  useListContacts,
  useRecipients,
  useSheetLeads,
  useUnsubscribes,
} from "@/hooks/use-blasts"
import { useSheets } from "@/hooks/use-sheets"
import { ApiError, apiPost } from "@/lib/api"
import { buildRows, countByStatus } from "@/lib/blasts/recipients"
import type { Blast, BlastList } from "@/lib/blasts/types"
import type { Sheet } from "@/lib/leads/sheets"

type Tab = "recipients" | "email"
type Dialog = "rename" | "audience" | "person" | "report" | "delete" | null

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
  const sheetLeads = useSheetLeads(blast?.sheetIds ?? [])
  const contacts = useListContacts(blast?.listIds ?? [])
  const { data: lists } = useBlastLists(id)
  const audienceData = React.useMemo(
    () => [...sheetLeads.data, ...contacts.data],
    [sheetLeads.data, contacts.data]
  )
  const audience = {
    data: audienceData,
    loading: sheetLeads.loading || contacts.loading,
  }
  // Titles for sheets and uploaded files, for labels and the source filter.
  const sources = React.useMemo(() => {
    const m = new Map<string, string>()
    for (const s of sheets) m.set(s.id, s.title)
    for (const l of lists)
      m.set(l.id, l.manual ? l.name : `${l.name} (uploaded)`)
    return m
  }, [sheets, lists])
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
      actions={
        blast && (
          <>
            <Button
              variant="outline"
              size="xl"
              className="max-sm:size-10 max-sm:px-0"
              onClick={() => setDialog("report")}
            >
              <FileChartColumnIcon />
              <span className="max-sm:sr-only">Report</span>
            </Button>
            <BlastMenu onPick={setDialog} />
          </>
        )
      }
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
                {[
                  ...blast.sheetIds.map((sid) => {
                    const s = sheetsById.get(sid)
                    return {
                      id: sid,
                      file: false,
                      label: s ? `${s.title} · ${s.client}` : "Deleted sheet",
                    }
                  }),
                  ...blast.listIds.map((lid) => {
                    const l = lists.find((x) => x.id === lid)
                    return {
                      id: lid,
                      file: true,
                      manual: l?.manual ?? false,
                      label: l
                        ? l.manual
                          ? `${l.name} · ${l.canEmail}`
                          : l.name
                        : "Uploaded file",
                    }
                  }),
                ]
                  .slice(0, SHOWN_SHEETS)
                  .map((c) => (
                    <Badge key={c.id} variant="outline" className="max-w-full">
                      {"manual" in c && c.manual ? (
                        <UserPlusIcon aria-label="Added by hand" />
                      ) : (
                        c.file && <FileUpIcon aria-label="Uploaded file" />
                      )}
                      <span className="truncate">{c.label}</span>
                    </Badge>
                  ))}
                {blast.sheetIds.length + blast.listIds.length >
                  SHOWN_SHEETS && (
                  <Badge variant="outline">
                    +
                    {blast.sheetIds.length +
                      blast.listIds.length -
                      SHOWN_SHEETS}{" "}
                    more
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="lg"
                  className="min-h-10 text-muted-foreground"
                  onClick={() => setDialog("audience")}
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
                sources={sources}
                form={form}
                onEditEmail={() => setTab("email")}
                onAddPerson={() => setDialog("person")}
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
      {blast && dialog === "audience" && (
        <AudienceDialog
          blast={blast}
          sheets={sheets}
          lists={lists}
          onClose={() => setDialog(null)}
        />
      )}
      {blast && dialog === "person" && (
        <AddPersonDialog blast={blast} onClose={() => setDialog(null)} />
      )}
      {blast && dialog === "report" && (
        <ReportDialog blast={blast} onClose={() => setDialog(null)} />
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
        <MenuItem value="audience">
          <ListChecksIcon />
          Change who it goes to
        </MenuItem>
        <MenuItem value="person">
          <UserPlusIcon />
          Add a person
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

export function RenameDialog({
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

function AudienceDialog({
  blast,
  sheets,
  lists,
  onClose,
}: {
  blast: Blast
  sheets: Sheet[]
  lists: BlastList[]
  onClose: () => void
}) {
  const [ids, setIds] = React.useState(
    blast.sheetIds.filter((id) => sheets.some((s) => s.id === id))
  )
  const myLists = lists.filter((l) => blast.listIds.includes(l.id))
  const [adding, setAdding] = React.useState(false)
  const [newList, setNewList] = React.useState<PickedList | null>(null)
  const [confirmRemove, setConfirmRemove] = React.useState<string | null>(null)
  const [removing, setRemoving] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string>()
  const [busy, setBusy] = React.useState(false)

  async function remove(listId: string) {
    if (confirmRemove !== listId) return setConfirmRemove(listId)
    setRemoving(listId)
    setError(undefined)
    try {
      await apiPost("/api/blasts/lists/remove", { blastId: blast.id, listId })
      toast.success({ title: "File removed from this blast" })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove it.")
    } finally {
      setRemoving(null)
      setConfirmRemove(null)
    }
  }

  async function save() {
    if (!ids.length && !myLists.length && !newList)
      return setError("Pick at least one sheet or upload a file.")
    if (adding && !newList)
      return setError("Choose a file, or close the upload.")
    setBusy(true)
    setError(undefined)
    try {
      if (newList)
        await apiPost("/api/blasts/lists/add", {
          blastId: blast.id,
          list: newList,
        })
      const changed =
        ids.length !== blast.sheetIds.length ||
        ids.some((i) => !blast.sheetIds.includes(i))
      if (changed)
        await apiPost("/api/blasts/update", { id: blast.id, sheetIds: ids })
      toast.success({ title: "Updated who it goes to" })
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
      title="Who it goes to"
      size="xl"
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
      <section className="flex min-w-0 flex-col gap-3" aria-label="Sheets">
        <h3 className="text-sm font-semibold">Your sheets</h3>
        <SheetPicker
          sheets={sheets}
          value={ids}
          onChange={(v) => {
            setIds(v)
            setError(undefined)
          }}
        />
      </section>
      <section
        className="flex min-w-0 flex-col gap-3"
        aria-label="Uploaded files"
      >
        <h3 className="text-sm font-semibold">Files uploaded for this blast</h3>
        {myLists.length > 0 ? (
          <ul className="flex flex-col divide-y rounded-xl border">
            {myLists.map((l) => (
              <li
                key={l.id}
                className="flex min-w-0 items-center gap-3 px-3 py-2"
              >
                {l.manual ? (
                  <UserPlusIcon
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                ) : (
                  <FileUpIcon
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{l.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {l.canEmail.toLocaleString()}{" "}
                    {l.canEmail === 1 ? "person" : "people"} to email
                  </span>
                </span>
                <Button
                  variant={confirmRemove === l.id ? "destructive" : "ghost"}
                  size="lg"
                  className="min-h-10 shrink-0"
                  disabled={removing !== null}
                  onClick={() => void remove(l.id)}
                >
                  {removing === l.id ? <Spinner /> : <Trash2Icon />}
                  {confirmRemove === l.id ? "Tap again to remove" : "Remove"}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          !adding && <p className="text-sm text-muted-foreground">None yet.</p>
        )}
        {adding ? (
          <ListUpload
            value={newList}
            onChange={(v) => {
              setNewList(v)
              setError(undefined)
            }}
          />
        ) : (
          <Button
            variant="outline"
            size="xl"
            className="self-start"
            onClick={() => setAdding(true)}
          >
            <FileUpIcon />
            Upload a file
          </Button>
        )}
      </section>
      {error && <p className="text-sm text-destructive-foreground">{error}</p>}
    </DialogShell>
  )
}

export function DeleteDialog({
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
