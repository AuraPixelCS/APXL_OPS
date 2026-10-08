"use client"

// Every imported sheet with its client: open its leads, rename it, delete it.

import { createListCollection } from "@ark-ui/react/collection"
import {
  ChevronRightIcon,
  FileSpreadsheetIcon,
  MoreHorizontalIcon,
  PencilIcon,
  SearchIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UploadIcon,
  UsersIcon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { ConfirmDialog, DialogShell } from "@/components/common/dialog-shell"
import { EmptyState } from "@/components/common/empty-state"
import { TextField } from "@/components/settings/form-bits"
import { AppShell } from "@/components/shell/app-shell"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { toast } from "@/components/ui/toast"
import { type ClientSummary, useSheets } from "@/hooks/use-sheets"
import { ApiError, apiPost } from "@/lib/api"
import { formatDateTime, formatRelative } from "@/lib/format"
import type { Sheet } from "@/lib/leads/sheets"

const ALL = "__all"

type Action = "open" | "rename" | "delete"

const leadsHref = (s: Sheet) => `/leads?sheet=${s.id}`
const plural = (n: number, one: string, many: string) =>
  `${n.toLocaleString()} ${n === 1 ? one : many}`

export function SheetsPage() {
  const router = useRouter()
  const { data: sheets, clients, loading, error } = useSheets()
  const [clientKey, setClientKey] = React.useState(ALL)
  const [search, setSearch] = React.useState("")
  const [renaming, setRenaming] = React.useState<Sheet | null>(null)
  const [deleting, setDeleting] = React.useState<Sheet | null>(null)

  const visible = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    return sheets.filter(
      (s) =>
        (clientKey === ALL || s.clientKey === clientKey) &&
        (!q ||
          s.title.toLowerCase().includes(q) ||
          s.client.toLowerCase().includes(q) ||
          s.fileName.toLowerCase().includes(q))
    )
  }, [sheets, clientKey, search])

  function run(action: Action, sheet: Sheet) {
    if (action === "open") router.push(leadsHref(sheet))
    if (action === "rename") setRenaming(sheet)
    if (action === "delete") setDeleting(sheet)
  }

  return (
    <AppShell
      title="Sheets"
      actions={
        <Button asChild size="lg">
          <Link href="/sheets/import">
            <UploadIcon />
            <span>Import</span>
          </Link>
        </Button>
      }
    >
      <div className="flex flex-col gap-5 page-x py-5 sm:py-6">
        <div>
          <h1 className="font-heading text-xl font-semibold tracking-tight">
            Lead sheets
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Every file you&rsquo;ve imported, with the client it belongs to.
            Open one to see its leads.
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>Couldn&rsquo;t load sheets</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!loading && sheets.length === 0 && !error ? (
          <EmptyState
            icon={FileSpreadsheetIcon}
            title="No sheets yet"
            body="Import a lead file from Meta, Excel, Google Sheets or Numbers. Each one becomes a sheet you can filter leads by. Importing doesn't email anyone."
            action={
              <Button asChild size="xl">
                <Link href="/sheets/import">
                  <UploadIcon />
                  Import a sheet
                </Link>
              </Button>
            }
          />
        ) : (
          <section aria-label="Sheets" className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <ClientSelect
                clients={clients}
                value={clientKey}
                onChange={setClientKey}
              />
              <InputGroup className="h-10 w-full md:w-72">
                <InputGroupAddon>
                  <SearchIcon aria-hidden />
                </InputGroupAddon>
                <InputGroupInput
                  type="search"
                  placeholder="Search sheets"
                  aria-label="Search sheets"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </InputGroup>
            </div>

            {loading ? (
              <div
                className="flex flex-col gap-2"
                role="status"
                aria-label="Loading sheets"
              >
                {Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-xl" />
                ))}
              </div>
            ) : visible.length === 0 ? (
              <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                No sheets match.
              </p>
            ) : (
              <>
                <SheetsTable sheets={visible} onAction={run} />
                <SheetCards sheets={visible} onAction={run} />
              </>
            )}
          </section>
        )}
      </div>

      {renaming && (
        <RenameDialog sheet={renaming} onClose={() => setRenaming(null)} />
      )}
      {deleting && (
        <ConfirmDialog
          open
          onClose={() => setDeleting(null)}
          title={`Delete “${deleting.title}”?`}
          body="Leads that only came from this sheet are deleted. Leads that also appear in another sheet stay there. This can't be undone."
          confirmLabel="Delete sheet"
          destructive
          onConfirm={async () => {
            const r = await apiPost<{
              deletedLeads: number
              keptLeads: number
            }>("/api/sheets/delete", { id: deleting.id })
            setDeleting(null)
            toast.success({
              title: "Sheet deleted",
              description: `${plural(r.deletedLeads, "lead", "leads")} deleted${r.keptLeads ? `, ${r.keptLeads} kept (also in other sheets)` : ""}.`,
            })
          }}
        />
      )}
    </AppShell>
  )
}

function ClientSelect({
  clients,
  value,
  onChange,
}: {
  clients: ClientSummary[]
  value: string
  onChange: (v: string) => void
}) {
  const collection = React.useMemo(
    () =>
      createListCollection({
        items: [
          { value: ALL, label: "All clients" },
          ...clients.map((c) => ({
            value: c.clientKey,
            label: `${c.client} · ${plural(c.sheets, "sheet", "sheets")}`,
          })),
        ],
      }),
    [clients]
  )
  return (
    <Select
      collection={collection}
      value={[value]}
      onValueChange={(d) => onChange(d.value[0] ?? ALL)}
      positioning={{ sameWidth: true }}
    >
      <SelectTrigger
        size="lg"
        className="h-10 w-full md:w-72"
        aria-label="Client"
      >
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
  )
}

function RowMenu({
  sheet,
  onAction,
}: {
  sheet: Sheet
  onAction: (a: Action, s: Sheet) => void
}) {
  return (
    <Menu onSelect={(d) => onAction(d.value as Action, sheet)}>
      <MenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xl"
          aria-label={`Actions for ${sheet.title}`}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontalIcon />
        </Button>
      </MenuTrigger>
      <MenuContent className="min-w-52">
        <MenuItem value="open">
          <UsersIcon />
          View leads
        </MenuItem>
        <MenuItem value="rename">
          <PencilIcon />
          Rename
        </MenuItem>
        <MenuSeparator />
        <MenuItem value="delete" variant="destructive">
          <Trash2Icon />
          Delete sheet
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}

function SheetsTable({
  sheets,
  onAction,
}: {
  sheets: Sheet[]
  onAction: (a: Action, s: Sheet) => void
}) {
  const router = useRouter()
  return (
    <div className="hidden overflow-hidden rounded-xl border md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Sheet</TableHead>
            <TableHead>Client</TableHead>
            <TableHead className="text-right">Leads</TableHead>
            <TableHead className="text-right">Imported</TableHead>
            <TableHead className="w-14">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sheets.map((s) => (
            <TableRow
              key={s.id}
              className="cursor-pointer"
              onClick={() => router.push(leadsHref(s))}
            >
              <TableCell className="max-w-96">
                <Link
                  href={leadsHref(s)}
                  className="block truncate font-medium outline-none hover:underline focus-visible:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {s.title}
                </Link>
                <span className="block truncate text-xs text-muted-foreground">
                  {s.fileName}
                  {s.tabName ? ` · ${s.tabName}` : ""}
                </span>
              </TableCell>
              <TableCell>
                <Badge variant="outline">{s.client || "No client"}</Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {s.people.toLocaleString()}
                {s.alreadyInOps > 0 && (
                  <span className="block text-xs text-muted-foreground">
                    {s.created.toLocaleString()} new
                  </span>
                )}
              </TableCell>
              <TableCell
                className="text-right whitespace-nowrap text-muted-foreground"
                title={formatDateTime(s.createdAt)}
              >
                {formatRelative(s.createdAt)}
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <RowMenu sheet={s} onAction={onAction} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function SheetCards({
  sheets,
  onAction,
}: {
  sheets: Sheet[]
  onAction: (a: Action, s: Sheet) => void
}) {
  return (
    <ul className="flex flex-col gap-2 md:hidden">
      {sheets.map((s) => (
        <li
          key={s.id}
          className="flex items-center gap-1 rounded-xl border bg-card"
        >
          <Link
            href={leadsHref(s)}
            className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-s-xl py-3 ps-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 active:bg-accent"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{s.title}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                <Badge variant="outline">{s.client || "No client"}</Badge>
                <span>{plural(s.people, "lead", "leads")}</span>
                <span aria-hidden>·</span>
                <span>{formatRelative(s.createdAt)}</span>
              </div>
            </div>
            <ChevronRightIcon
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
          </Link>
          <div className="pe-1">
            <RowMenu sheet={s} onAction={onAction} />
          </div>
        </li>
      ))}
    </ul>
  )
}

function RenameDialog({
  sheet,
  onClose,
}: {
  sheet: Sheet
  onClose: () => void
}) {
  const [title, setTitle] = React.useState(sheet.title)
  const [error, setError] = React.useState<string | undefined>()
  const [busy, setBusy] = React.useState(false)

  async function save() {
    setBusy(true)
    setError(undefined)
    try {
      await apiPost("/api/sheets/update", { id: sheet.id, title })
      toast.success({ title: "Sheet renamed" })
      onClose()
    } catch (e) {
      setError(
        e instanceof ApiError
          ? (e.fields.title ?? e.message)
          : "Couldn't rename it."
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogShell
      open
      onClose={onClose}
      title="Rename sheet"
      description={`Client: ${sheet.client || "none"}. To file it under a different client, delete it and import the file again.`}
      footer={
        <>
          <Button variant="outline" size="lg" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button size="lg" onClick={save} disabled={busy}>
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
        <TextField
          label="Title"
          value={title}
          onChange={setTitle}
          error={error}
        />
      </form>
    </DialogShell>
  )
}
