"use client"

// Who a blast goes to: filter (not sent / sent / failed / …), pick people
// (a quick "first 100" or one by one), and send. Sends go out in requests of
// MAX_SEND_PER_REQUEST; the server skips anyone already sent or unsubscribed.
// People who already got it can be picked to get it again (one by one, or in
// bulk from the Sent tab only, so a bulk pick elsewhere never sweeps them in).

import { createListCollection } from "@ark-ui/react/collection"
import {
  RotateCwIcon,
  SearchIcon,
  SendIcon,
  TriangleAlertIcon,
  UserPlusIcon,
  XIcon,
} from "lucide-react"
import * as React from "react"
import type { BlastEmailForm } from "@/components/blasts/use-blast-email-form"
import { CheckMark } from "@/components/common/check-mark"
import { DialogShell } from "@/components/common/dialog-shell"
import { FilterTabs } from "@/components/common/filter-tabs"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { toast } from "@/components/ui/toast"
import { apiPost } from "@/lib/api"
import {
  canResend,
  canSelect,
  type RecipientRow,
  type RowStatus,
  STATUS_LABEL,
} from "@/lib/blasts/recipients"
import { type Blast, MAX_SEND_PER_REQUEST } from "@/lib/blasts/types"
import { formatDateTime, formatRelative } from "@/lib/format"
import { cn } from "@/lib/utils"

type Filter =
  "not_sent" | "failed" | "sent" | "unsubscribed" | "cant_email" | "all"
const ALL_SHEETS = "__all"
const PAGE = 100
const QUICK_PICKS = [50, 100, 200]

type SendResult = {
  sent: number
  resent: number
  failed: number
  notSent: number
  skipped: {
    notInBlast: number
    alreadySent: number
    unsubscribed: number
    inProgress: number
  }
  error: string | null
}

const STATUS_BADGE: Record<
  RowStatus,
  "outline" | "info" | "success" | "warning" | "secondary"
> = {
  not_sent: "outline",
  sending: "info",
  sent: "success",
  failed: "warning",
  unsubscribed: "secondary",
  cant_email: "secondary",
}

export function RecipientsTab({
  blast,
  rows,
  counts,
  loading,
  sources,
  form,
  onEditEmail,
  onAddPerson,
}: {
  blast: Blast
  rows: RecipientRow[]
  counts: Record<RowStatus, number>
  loading: boolean
  /** Sheet and uploaded-file titles by id. */
  sources: Map<string, string>
  form: BlastEmailForm
  onEditEmail: () => void
  onAddPerson: () => void
}) {
  const [filter, setFilter] = React.useState<Filter>("not_sent")
  const [sheetId, setSheetId] = React.useState(ALL_SHEETS)
  const [search, setSearch] = React.useState("")
  const [picked, setPicked] = React.useState<Set<string>>(new Set())
  const [shown, setShown] = React.useState(PAGE)
  const [confirming, setConfirming] = React.useState(false)
  // One person's Resend button (their row), apart from the picked list.
  const [resendRow, setResendRow] = React.useState<RecipientRow | null>(null)

  const visible = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(
      (r) =>
        (filter === "all" || r.status === filter) &&
        (sheetId === ALL_SHEETS || r.sheetIds.includes(sheetId)) &&
        (!q || r.name.toLowerCase().includes(q) || r.email.includes(q))
    )
  }, [rows, filter, sheetId, search])
  // Bulk picks (first N, everyone shown) take people who already got it only
  // on the Sent tab; elsewhere they're picked one by one.
  const bulkPick = filter === "sent" ? canResend : canSelect
  const selectable = visible.filter(bulkPick)
  const pickable = (r: RecipientRow) => canSelect(r) || canResend(r)
  // Someone picked earlier may have unsubscribed or been taken out meanwhile.
  const selected = rows.filter((r) => picked.has(r.key) && pickable(r))
  const again = selected.filter((r) => r.status === "sent").length
  const page = visible.slice(0, shown)
  const pageSelectable = page.filter(bulkPick)
  const pageAllOn =
    pageSelectable.length > 0 && pageSelectable.every((r) => picked.has(r.key))

  function toggle(key: string) {
    setPicked((p) => {
      const next = new Set(p)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function askResend(r: RecipientRow) {
    if (blocked)
      return toast.error({ title: "Can’t resend yet", description: blocked })
    setResendRow(r)
  }

  function pickFirst(n: number) {
    setPicked(new Set(selectable.slice(0, n).map((r) => r.key)))
    setShown((s) => Math.max(s, Math.min(n, PAGE * 5)))
  }

  function togglePage() {
    setPicked((p) => {
      const next = new Set(p)
      for (const r of pageSelectable) {
        if (pageAllOn) next.delete(r.key)
        else next.add(r.key)
      }
      return next
    })
  }

  const filters: { value: Filter; label: string }[] = [
    {
      value: "not_sent",
      label: `Not sent (${counts.not_sent.toLocaleString()})`,
    },
    ...(counts.failed
      ? [{ value: "failed" as const, label: `Failed (${counts.failed})` }]
      : []),
    { value: "sent", label: `Sent (${counts.sent.toLocaleString()})` },
    { value: "unsubscribed", label: `Unsubscribed (${counts.unsubscribed})` },
    ...(counts.cant_email
      ? [
          {
            value: "cant_email" as const,
            label: `Can’t email (${counts.cant_email})`,
          },
        ]
      : []),
    { value: "all", label: `All (${rows.length.toLocaleString()})` },
  ]

  const blocked = form.dirty
    ? "You have unsaved changes to the email. Save them first, so people get the version you see."
    : !form.readyToSend
      ? "The email isn’t finished yet. Add the sender, a subject and a message."
      : null

  return (
    <section aria-label="Recipients" className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <FilterTabs
          value={filter}
          onChange={(f) => {
            setFilter(f)
            setShown(PAGE)
          }}
          options={filters}
          label="Show recipients"
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          {blast.sheetIds.length + blast.listIds.length > 1 && (
            <SheetFilter
              sheetIds={[...blast.sheetIds, ...blast.listIds]}
              sources={sources}
              value={sheetId}
              onChange={(v) => {
                setSheetId(v)
                setShown(PAGE)
              }}
            />
          )}
          <InputGroup className="h-10 w-full sm:w-72">
            <InputGroupAddon>
              <SearchIcon aria-hidden />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              placeholder="Search name or email"
              aria-label="Search recipients"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </InputGroup>
          <Button
            variant="outline"
            size="xl"
            className="sm:ms-auto"
            onClick={onAddPerson}
          >
            <UserPlusIcon />
            Add a person
          </Button>
        </div>
        {selectable.length > 0 && (
          <div
            className="flex flex-wrap items-center gap-2"
            role="group"
            aria-label="Quick select"
          >
            <span className="text-sm text-muted-foreground">
              Select the first
            </span>
            {QUICK_PICKS.filter((n) => n < selectable.length).map((n) => (
              <Button
                key={n}
                variant="outline"
                size="lg"
                className="min-h-10"
                onClick={() => pickFirst(n)}
              >
                {n}
              </Button>
            ))}
            <Button
              variant="outline"
              size="lg"
              className="min-h-10"
              onClick={() => pickFirst(selectable.length)}
            >
              All {selectable.length.toLocaleString()}
            </Button>
          </div>
        )}
      </div>

      {loading ? (
        <div
          className="flex flex-col gap-2"
          role="status"
          aria-label="Loading recipients"
        >
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          {filter === "not_sent" && rows.length > 0
            ? "Everyone here has been sent this blast."
            : "Nobody in this list."}
        </p>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    {pageSelectable.length > 0 && (
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={pageAllOn}
                        aria-label="Select everyone shown"
                        onClick={togglePage}
                        className="flex size-10 items-center justify-center rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
                      >
                        <CheckMark
                          checked={pageAllOn}
                          indeterminate={pageSelectable.some((r) =>
                            picked.has(r.key)
                          )}
                        />
                      </button>
                    )}
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Sheet</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-32">
                    <span className="sr-only">Resend</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {page.map((r) => {
                  const can = pickable(r)
                  const on = picked.has(r.key)
                  return (
                    <TableRow
                      key={r.key}
                      className={cn(
                        can && "cursor-pointer",
                        on && "bg-accent/50"
                      )}
                      onClick={can ? () => toggle(r.key) : undefined}
                    >
                      <TableCell className="py-1">
                        {can && (
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={on}
                            aria-label={`Select ${r.name || r.email}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              toggle(r.key)
                            }}
                            className="flex size-10 items-center justify-center rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
                          >
                            <CheckMark checked={on} />
                          </button>
                        )}
                      </TableCell>
                      <TableCell className="max-w-56">
                        <span className="block truncate font-medium">
                          {r.name || "—"}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-72 text-muted-foreground">
                        <span className="block truncate">
                          {r.email || "No email"}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-56 text-muted-foreground">
                        <span className="block truncate">
                          {sheetLabel(r, sources)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <StatusCell row={r} />
                      </TableCell>
                      <TableCell className="py-1 text-right">
                        {canResend(r) && (
                          <Button
                            variant="outline"
                            size="lg"
                            className="min-h-10"
                            aria-label={`Resend to ${r.name || r.email}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              askResend(r)
                            }}
                          >
                            <RotateCwIcon />
                            Resend
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          <ul className="flex flex-col gap-2 md:hidden">
            {page.map((r) => {
              const can = pickable(r)
              const on = picked.has(r.key)
              const inner = (
                <>
                  {can && <CheckMark checked={on} className="mt-0.5" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {r.name || "—"}
                    </span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {r.email || "No email"}
                    </span>
                    <span className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <StatusCell row={r} />
                      <span className="truncate">{sheetLabel(r, sources)}</span>
                    </span>
                  </span>
                </>
              )
              return (
                <li key={r.key} className="flex items-stretch gap-2">
                  {can ? (
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      onClick={() => toggle(r.key)}
                      className={cn(
                        "flex min-w-0 flex-1 items-start gap-3 rounded-xl border bg-card px-4 py-3 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 active:bg-accent",
                        on && "border-primary/60 bg-accent/60"
                      )}
                    >
                      {inner}
                    </button>
                  ) : (
                    <div className="flex min-w-0 flex-1 items-start gap-3 rounded-xl border bg-card px-4 py-3">
                      {inner}
                    </div>
                  )}
                  {canResend(r) && (
                    <Button
                      variant="outline"
                      aria-label={`Resend to ${r.name || r.email}`}
                      className="h-auto w-16 shrink-0 flex-col gap-1 rounded-xl px-0 text-xs"
                      onClick={() => askResend(r)}
                    >
                      <RotateCwIcon />
                      Resend
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Showing {page.length.toLocaleString()} of{" "}
              {visible.length.toLocaleString()}
            </p>
            {visible.length > shown && (
              <Button
                variant="outline"
                size="lg"
                className="min-h-10"
                onClick={() => setShown((s) => s + PAGE)}
              >
                Show {Math.min(PAGE, visible.length - shown)} more
              </Button>
            )}
          </div>
        </>
      )}

      {selected.length > 0 && (
        <div
          className={cn(
            "sticky bottom-0 z-10 -mx-4 flex flex-col gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8",
            "pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          )}
        >
          {blocked && (
            <Alert variant="warning">
              <TriangleAlertIcon />
              <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span>{blocked}</span>
                <Button
                  variant="outline"
                  size="lg"
                  className="min-h-10 shrink-0"
                  onClick={onEditEmail}
                >
                  Open the email
                </Button>
              </AlertDescription>
            </Alert>
          )}
          <div className="flex items-center gap-2">
            <p className="min-w-0 flex-1 text-sm" aria-live="polite">
              <span className="font-semibold">
                {selected.length.toLocaleString()}
              </span>{" "}
              selected
              {again > 0 && again < selected.length && (
                <span className="text-muted-foreground">
                  {" "}
                  · {again.toLocaleString()} again
                </span>
              )}
            </p>
            <Button
              variant="ghost"
              size="xl"
              onClick={() => setPicked(new Set())}
            >
              <XIcon />
              <span className="max-sm:sr-only">Clear</span>
            </Button>
            <Button
              size="xl"
              disabled={!!blocked}
              onClick={() => setConfirming(true)}
            >
              {again === selected.length ? <RotateCwIcon /> : <SendIcon />}
              {again === selected.length ? "Resend to" : "Send to"}{" "}
              {selected.length.toLocaleString()}
            </Button>
          </div>
        </div>
      )}

      {confirming && (
        <ConfirmSend
          blast={blast}
          rows={selected}
          onClose={() => setConfirming(false)}
          onDone={() => {
            setConfirming(false)
            setPicked(new Set())
          }}
        />
      )}
      {resendRow && (
        <ConfirmSend
          blast={blast}
          rows={[resendRow]}
          onClose={() => setResendRow(null)}
          onDone={() => setResendRow(null)}
        />
      )}
    </section>
  )
}

function sheetLabel(r: RecipientRow, sources: Map<string, string>): string {
  if (r.outside) return "No longer in this blast's sheets or files"
  const first = sources.get(r.sheetIds[r.sheetIds.length - 1] ?? "")
  const more = r.sheetIds.length - 1
  return first ? `${first}${more > 0 ? ` +${more}` : ""}` : "—"
}

function StatusCell({ row }: { row: RecipientRow }) {
  const badge = (
    <Badge variant={STATUS_BADGE[row.status]}>{STATUS_LABEL[row.status]}</Badge>
  )
  if (row.status === "sent" && row.sentAt)
    return (
      <span
        className="inline-flex items-center gap-1.5"
        title={`Sent ${formatDateTime(row.sentAt)}${row.resentAt ? ` · sent again ${formatDateTime(row.resentAt)}` : ""}`}
      >
        {badge}
        <span className="text-xs text-muted-foreground">
          {row.resentAt
            ? `again ${formatRelative(row.resentAt)}`
            : formatRelative(row.sentAt)}
        </span>
      </span>
    )
  if (row.status === "failed" && row.error)
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex max-w-full items-center gap-1.5">
            {badge}
            <span className="truncate text-xs text-muted-foreground">
              {row.error}
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-72">{row.error}</TooltipContent>
      </Tooltip>
    )
  return badge
}

function SheetFilter({
  sheetIds,
  sources,
  value,
  onChange,
}: {
  sheetIds: string[]
  sources: Map<string, string>
  value: string
  onChange: (v: string) => void
}) {
  const collection = React.useMemo(
    () =>
      createListCollection({
        items: [
          { value: ALL_SHEETS, label: "All sheets and files" },
          ...sheetIds.map((id) => ({
            value: id,
            label: sources.get(id) ?? "Deleted sheet",
          })),
        ],
      }),
    [sheetIds, sources]
  )
  return (
    <Select
      collection={collection}
      value={[value]}
      onValueChange={(d) => onChange(d.value[0] ?? ALL_SHEETS)}
      positioning={{ sameWidth: true }}
    >
      <SelectTrigger
        size="lg"
        className="h-10 w-full sm:w-72"
        aria-label="Sheet"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {collection.items.map((item) => (
          <SelectItem key={item.value} item={item}>
            <span className="truncate">{item.label}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function ConfirmSend({
  blast,
  rows,
  onClose,
  onDone,
}: {
  blast: Blast
  rows: RecipientRow[]
  onClose: () => void
  onDone: () => void
}) {
  const [busy, setBusy] = React.useState(false)
  const [progress, setProgress] = React.useState(0)
  const n = rows.length
  const again = rows.filter((r) => r.status === "sent").length
  const verb = again === n ? "Resend to" : "Send to"

  async function send() {
    setBusy(true)
    const total = { sent: 0, resent: 0, failed: 0, notSent: 0, skipped: 0 }
    let error: string | null = null
    try {
      for (let i = 0; i < rows.length; i += MAX_SEND_PER_REQUEST) {
        const chunk = rows.slice(i, i + MAX_SEND_PER_REQUEST)
        const r = await apiPost<SendResult>("/api/blasts/send", {
          id: blast.id,
          emails: chunk.map((c) => c.email),
          // Only these may get it a second time; anyone else already sent is skipped.
          resend: chunk.filter((c) => c.status === "sent").map((c) => c.email),
        })
        total.sent += r.sent
        total.resent += r.resent ?? 0
        total.failed += r.failed
        total.notSent += r.notSent
        total.skipped +=
          r.skipped.alreadySent +
          r.skipped.unsubscribed +
          r.skipped.inProgress +
          r.skipped.notInBlast
        setProgress(Math.min(n, i + chunk.length))
        if (r.error) {
          error = r.error
          // An account-level stop (daily limit, key): don't keep trying.
          if (r.notSent) {
            total.notSent += rows.length - (i + chunk.length)
            break
          }
        }
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "The send failed."
    }
    const parts = [
      total.failed && `${total.failed} failed`,
      total.notSent && `${total.notSent} not sent`,
      total.skipped &&
        `${total.skipped} skipped (already sent or unsubscribed)`,
    ].filter(Boolean)
    if (total.sent)
      toast.success({
        title: `${total.resent === total.sent ? "Sent again" : "Sent"} to ${total.sent.toLocaleString()} ${total.sent === 1 ? "person" : "people"}`,
        description:
          [
            [
              total.resent &&
                total.resent < total.sent &&
                `${total.resent.toLocaleString()} of them again`,
              ...parts,
            ]
              .filter(Boolean)
              .join(" · "),
            error,
          ]
            .filter(Boolean)
            .join(". ") || undefined,
      })
    else
      toast.error({
        title: "Nothing was sent",
        description: error ?? (parts.join(" · ") || undefined),
      })
    onDone()
  }

  return (
    <DialogShell
      open
      onClose={busy ? () => {} : onClose}
      title={
        n === 1
          ? `${verb} ${rows[0].name || rows[0].email}?`
          : `${verb} ${n.toLocaleString()} people?`
      }
      footer={
        <>
          <Button variant="outline" size="xl" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button size="xl" onClick={send} disabled={busy}>
            {busy ? <Spinner /> : again === n ? <RotateCwIcon /> : <SendIcon />}
            {busy ? "Sending…" : `${verb} ${n.toLocaleString()}`}
          </Button>
        </>
      }
    >
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">From</dt>
        <dd className="min-w-0 break-words">
          {blast.email.fromName} &lt;{blast.email.fromEmail}&gt;
        </dd>
        <dt className="text-muted-foreground">Subject</dt>
        <dd className="min-w-0 break-words">{blast.email.subject}</dd>
        <dt className="text-muted-foreground">To</dt>
        <dd className="min-w-0 break-words">
          {rows
            .slice(0, 3)
            .map((r) => r.name || r.email)
            .join(", ")}
          {n > 3 && ` and ${(n - 3).toLocaleString()} more`}
        </dd>
      </dl>
      {again > 0 && (
        <Alert variant="warning">
          <RotateCwIcon />
          <AlertDescription>
            {again === n
              ? n === 1
                ? "They already got this email. They'll get it again."
                : "They all already got this email. They'll get it again."
              : `${again.toLocaleString()} of them already got this email. They'll get it again.`}
          </AlertDescription>
        </Alert>
      )}
      {busy && n > MAX_SEND_PER_REQUEST && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          Sent {progress.toLocaleString()} of {n.toLocaleString()}…
        </p>
      )}
    </DialogShell>
  )
}
