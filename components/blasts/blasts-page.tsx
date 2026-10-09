"use client"

// Every email blast: open one, or start a new one from imported sheets.

import {
  ChevronRightIcon,
  MailIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"
import { DeleteDialog, RenameDialog } from "@/components/blasts/blast-page"
import { ListUpload, type PickedList } from "@/components/blasts/list-upload"
import { SheetPicker } from "@/components/blasts/sheet-picker"
import { DialogShell } from "@/components/common/dialog-shell"
import { EmptyState } from "@/components/common/empty-state"
import { FilterTabs } from "@/components/common/filter-tabs"
import { TextField } from "@/components/settings/form-bits"
import { AppShell } from "@/components/shell/app-shell"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useBlasts } from "@/hooks/use-blasts"
import { useSheets } from "@/hooks/use-sheets"
import { ApiError, apiPost } from "@/lib/api"
import type { Blast } from "@/lib/blasts/types"
import { formatDateTime, formatRelative } from "@/lib/format"
import type { Sheet } from "@/lib/leads/sheets"

const blastHref = (b: Blast) => `/blasts/${b.id}`

type Action = "open" | "rename" | "delete"

/** "Skill2U, PEOPLElogy" for a blast's sheets. */
function clientsOf(b: Blast, sheetsById: Map<string, Sheet>): string {
  const names = new Set(
    b.sheetIds.map((id) => sheetsById.get(id)?.client).filter(Boolean)
  )
  if (b.listIds.length)
    names.add(
      b.listIds.length === 1
        ? "Uploaded file"
        : `${b.listIds.length} uploaded files`
    )
  return [...names].join(", ")
}

export function BlastsPage() {
  const { data: blasts, loading, error } = useBlasts()
  const { data: sheets } = useSheets()
  const [creating, setCreating] = React.useState(false)
  const [acting, setActing] = React.useState<{
    action: "rename" | "delete"
    blast: Blast
  } | null>(null)
  const router = useRouter()

  function run(action: Action, blast: Blast) {
    if (action === "open") router.push(blastHref(blast))
    else setActing({ action, blast })
  }
  const sheetsById = React.useMemo(
    () => new Map(sheets.map((s) => [s.id, s])),
    [sheets]
  )

  const newButton = (size: "lg" | "xl") => (
    <Button size={size} onClick={() => setCreating(true)}>
      <PlusIcon />
      <span>New blast</span>
    </Button>
  )

  return (
    <AppShell
      title="Email blasts"
      actions={blasts.length > 0 && newButton("lg")}
    >
      <div className="flex flex-col gap-5 page-x py-5 sm:py-6">
        <div>
          <h1 className="font-heading text-xl font-semibold tracking-tight">
            Email blasts
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Each blast has its own email and remembers who it has been sent to,
            so you can send in rounds: 100 today, the next 100 tomorrow.
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>Couldn&rsquo;t load blasts</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div
            className="flex flex-col gap-2"
            role="status"
            aria-label="Loading blasts"
          >
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : blasts.length === 0 && !error ? (
          <EmptyState
            icon={MailIcon}
            title="No blasts yet"
            body="Start one, choose who it goes to (your imported sheets, or a file you upload just for it), write the email, then send it to as many people at a time as you like."
            action={newButton("xl")}
          />
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-xl border md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Blast</TableHead>
                    <TableHead>Goes to</TableHead>
                    <TableHead className="text-right">Sent</TableHead>
                    <TableHead className="text-right">Last sent</TableHead>
                    <TableHead className="w-14">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {blasts.map((b) => (
                    <BlastRow
                      key={b.id}
                      blast={b}
                      clients={clientsOf(b, sheetsById)}
                      onAction={run}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
            <ul className="flex flex-col gap-2 md:hidden">
              {blasts.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center gap-1 rounded-xl border bg-card"
                >
                  <Link
                    href={blastHref(b)}
                    className="flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-s-xl py-3 ps-4 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 active:bg-accent"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{b.name}</p>
                      <p className="mt-0.5 truncate text-sm text-muted-foreground">
                        {b.email.subject || "No subject yet"}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <Badge variant={b.sentCount ? "info" : "outline"}>
                          {b.sentCount
                            ? `${b.sentCount.toLocaleString()} sent`
                            : "Not sent yet"}
                        </Badge>
                        <span className="truncate">
                          {clientsOf(b, sheetsById) ||
                            `${b.sheetIds.length} sheets`}
                        </span>
                      </div>
                    </div>
                    <ChevronRightIcon
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                  </Link>
                  <div className="pe-1">
                    <RowMenu blast={b} onAction={run} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {acting?.action === "rename" && (
        <RenameDialog blast={acting.blast} onClose={() => setActing(null)} />
      )}
      {acting?.action === "delete" && (
        <DeleteDialog blast={acting.blast} onClose={() => setActing(null)} />
      )}
      {creating && (
        <NewBlastDialog
          sheets={sheets}
          defaultName={`Email blast ${blasts.length + 1}`}
          onClose={() => setCreating(false)}
        />
      )}
    </AppShell>
  )
}

function RowMenu({
  blast,
  onAction,
}: {
  blast: Blast
  onAction: (a: Action, b: Blast) => void
}) {
  return (
    <Menu onSelect={(d) => onAction(d.value as Action, blast)}>
      <MenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xl"
          aria-label={`Actions for ${blast.name}`}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontalIcon />
        </Button>
      </MenuTrigger>
      <MenuContent className="min-w-52">
        <MenuItem value="open">
          <MailIcon />
          Open
        </MenuItem>
        <MenuItem value="rename">
          <PencilIcon />
          Rename
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

function BlastRow({
  blast: b,
  clients,
  onAction,
}: {
  blast: Blast
  clients: string
  onAction: (a: Action, b: Blast) => void
}) {
  const router = useRouter()
  return (
    <TableRow
      className="cursor-pointer"
      onClick={() => router.push(blastHref(b))}
    >
      <TableCell className="max-w-96">
        <Link
          href={blastHref(b)}
          className="block truncate font-medium outline-none hover:underline focus-visible:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {b.name}
        </Link>
        <span className="block truncate text-xs text-muted-foreground">
          {b.email.subject || "No subject yet"}
        </span>
      </TableCell>
      <TableCell className="max-w-72">
        <span className="block truncate">{clients || "—"}</span>
        <span className="block text-xs text-muted-foreground">
          {[
            b.sheetIds.length &&
              `${b.sheetIds.length} ${b.sheetIds.length === 1 ? "sheet" : "sheets"}`,
            b.listIds.length &&
              `${b.listIds.length} ${b.listIds.length === 1 ? "file" : "files"}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {b.sentCount.toLocaleString()}
      </TableCell>
      <TableCell
        className="text-right whitespace-nowrap text-muted-foreground"
        title={formatDateTime(b.lastSentAt)}
      >
        {b.lastSentAt ? formatRelative(b.lastSentAt) : "Not yet"}
      </TableCell>
      <TableCell onClick={(e) => e.stopPropagation()}>
        <RowMenu blast={b} onAction={onAction} />
      </TableCell>
    </TableRow>
  )
}

type Source = "sheets" | "file"

function NewBlastDialog({
  sheets,
  defaultName,
  onClose,
}: {
  sheets: Sheet[]
  defaultName: string
  onClose: () => void
}) {
  const router = useRouter()
  const [name, setName] = React.useState(defaultName)
  // With no sheets imported yet, uploading a file is the only way in.
  const [source, setSource] = React.useState<Source>(
    sheets.length ? "sheets" : "file"
  )
  const [sheetIds, setSheetIds] = React.useState<string[]>([])
  const [list, setList] = React.useState<PickedList | null>(null)
  const [errors, setErrors] = React.useState<{
    name?: string
    sheetIds?: string
    list?: string
  }>({})
  const [busy, setBusy] = React.useState(false)

  async function create() {
    const e: typeof errors = {}
    if (!name.trim()) e.name = "Give the blast a name."
    if (source === "sheets" && !sheetIds.length)
      e.sheetIds = "Pick at least one sheet."
    if (source === "file" && !list) e.list = "Choose a file of people first."
    setErrors(e)
    if (Object.keys(e).length) return
    setBusy(true)
    try {
      const { id } = await apiPost<{ id: string }>(
        "/api/blasts/create",
        source === "sheets" ? { name, sheetIds } : { name, sheetIds: [], list }
      )
      onClose()
      router.push(`/blasts/${id}?tab=email`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't create it."
      setErrors(
        err instanceof ApiError && Object.keys(err.fields).length
          ? err.fields
          : source === "sheets"
            ? { sheetIds: msg }
            : { list: msg }
      )
      setBusy(false)
    }
  }

  return (
    <DialogShell
      open
      onClose={onClose}
      title="New email blast"
      size="xl"
      description="Name it and choose who it goes to. You'll write the email next; nothing is sent until you press Send."
      footer={
        <>
          <Button variant="outline" size="xl" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button size="xl" onClick={create} disabled={busy}>
            {busy && <Spinner />}
            {busy && source === "file" ? "Saving the list…" : "Create blast"}
          </Button>
        </>
      }
    >
      <TextField
        label="Name"
        value={name}
        onChange={(v) => {
          setName(v)
          setErrors((e) => ({ ...e, name: undefined }))
        }}
        error={errors.name}
        helper="Only you and other admins see this."
      />
      <div className="flex min-w-0 flex-col gap-3">
        <p className="text-sm font-medium">Who&rsquo;s it for?</p>
        <FilterTabs
          value={source}
          onChange={(v) => {
            setSource(v)
            setErrors((e) => ({ ...e, sheetIds: undefined, list: undefined }))
          }}
          label="Who it's for"
          options={[
            { value: "sheets", label: "From your sheets" },
            { value: "file", label: "Upload a file" },
          ]}
        />
        {source === "sheets" ? (
          <SheetPicker
            sheets={sheets}
            value={sheetIds}
            onChange={(ids) => {
              setSheetIds(ids)
              setErrors((e) => ({ ...e, sheetIds: undefined }))
            }}
            error={errors.sheetIds}
          />
        ) : (
          <ListUpload
            value={list}
            onChange={(v) => {
              setList(v)
              setErrors((e) => ({ ...e, list: undefined }))
            }}
            error={errors.list}
          />
        )}
      </div>
    </DialogShell>
  )
}
