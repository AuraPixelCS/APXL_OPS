"use client"

import { createListCollection } from "@ark-ui/react/collection"
import {
  BuildingIcon,
  ChevronRightIcon,
  SearchIcon,
  TriangleAlertIcon,
  UploadIcon,
  UsersIcon,
  XIcon,
} from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import * as React from "react"
import { EmptyState } from "@/components/common/empty-state"
import { FilterTabs } from "@/components/common/filter-tabs"
import { StatTile } from "@/components/common/stat-tile"
import {
  FLAG_LABELS,
  FLAG_SHORT,
  ScoreBadge,
  StatusBadge,
} from "@/components/leads/lead-badges"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
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
import { LIST_LIMIT, useLeads } from "@/hooks/use-leads"
import { type ClientSummary, useSheets } from "@/hooks/use-sheets"
import { formatRelative } from "@/lib/format"
import { needsALook } from "@/lib/leads/clean"
import type { Sheet } from "@/lib/leads/sheets"
import type { Lead } from "@/lib/leads/types"

type Filter = "all" | "new" | "look" | "cant"

const FILTERS: { value: Filter; label: string; test: (l: Lead) => boolean }[] =
  [
    { value: "all", label: "All", test: () => true },
    {
      value: "new",
      label: "Not contacted",
      test: (l) => l.status === "new" && l.emailOk,
    },
    { value: "look", label: "Needs a look", test: needsALook },
    { value: "cant", label: "Can’t email", test: (l) => !l.emailOk },
  ]

const ALL = "__all"

export function LeadsPage() {
  const router = useRouter()
  const params = useSearchParams()
  const sheetId = params.get("sheet") ?? ""
  const clientParam = params.get("client") ?? ""
  const { data: sheets, clients } = useSheets()
  const sheetsById = React.useMemo(
    () => new Map(sheets.map((s) => [s.id, s])),
    [sheets]
  )
  const sheet = sheetId ? sheetsById.get(sheetId) : undefined
  // A sheet belongs to one client, so picking a sheet picks its client too.
  const clientKey = sheet?.clientKey ?? (sheetId ? "" : clientParam)
  const {
    data: leads,
    loading,
    error,
    capped,
  } = useLeads(sheetId ? { sheetId } : { clientKey })
  const [filter, setFilter] = React.useState<Filter>("all")
  const [search, setSearch] = React.useState("")
  const scoped = Boolean(sheetId || clientKey)

  function setScope(next: { client?: string; sheet?: string }) {
    const q = new URLSearchParams()
    if (next.sheet) q.set("sheet", next.sheet)
    else if (next.client) q.set("client", next.client)
    const qs = q.toString()
    router.replace(qs ? `/leads?${qs}` : "/leads", { scroll: false })
  }

  const counts = React.useMemo(
    () => ({
      all: leads.length,
      notContacted: leads.filter((l) => l.status === "new" && l.emailOk).length,
      replied: leads.filter((l) => l.status === "replied").length,
      hot: leads.filter((l) => l.score === "hot").length,
    }),
    [leads]
  )

  const visible = React.useMemo(() => {
    const test = FILTERS.find((f) => f.value === filter)?.test ?? (() => true)
    const q = search.trim().toLowerCase()
    return leads.filter(
      (l) =>
        test(l) &&
        (!q ||
          l.name.toLowerCase().includes(q) ||
          l.email.includes(q) ||
          l.phone.includes(q))
    )
  }, [leads, filter, search])

  const nothingYet = !loading && !scoped && leads.length === 0 && !error

  return (
    <AppShell
      title="Leads"
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
        {(sheets.length > 0 || scoped) && (
          <section
            aria-label="Choose client and sheet"
            className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center"
          >
            <ClientFilter
              clients={clients}
              value={clientKey || ALL}
              onChange={(v) => setScope({ client: v === ALL ? "" : v })}
            />
            <SheetFilter
              sheets={
                clientKey
                  ? sheets.filter((s) => s.clientKey === clientKey)
                  : sheets
              }
              showClient={!clientKey}
              value={sheetId || ALL}
              onChange={(v) =>
                setScope(v === ALL ? { client: clientKey } : { sheet: v })
              }
            />
            {scoped && (
              <Button
                variant="ghost"
                size="xl"
                className="self-start sm:self-auto"
                onClick={() => setScope({})}
              >
                <XIcon />
                Show all leads
              </Button>
            )}
          </section>
        )}

        {sheetId && !sheet && sheets.length > 0 && (
          <Alert>
            <TriangleAlertIcon />
            <AlertTitle>That sheet no longer exists</AlertTitle>
            <AlertDescription>
              It may have been deleted. Pick another sheet above.
            </AlertDescription>
          </Alert>
        )}

        <section
          aria-label="Lead counts"
          className="grid grid-cols-2 gap-3 lg:grid-cols-4"
        >
          <StatTile
            label={
              sheet
                ? "Leads in this sheet"
                : clientKey
                  ? "Leads for this client"
                  : "All leads"
            }
            value={loading ? "–" : counts.all}
          />
          <StatTile
            label="Not contacted yet"
            value={loading ? "–" : counts.notContacted}
            tone="brand"
          />
          <StatTile label="Replied" value={loading ? "–" : counts.replied} />
          <StatTile
            label="Hot"
            value={loading ? "–" : counts.hot}
            tone="warning"
          />
        </section>

        {error && (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>Couldn&rsquo;t load leads</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {nothingYet ? (
          <EmptyState
            icon={UsersIcon}
            title="No leads yet"
            body="Import a lead sheet: a Meta export, Excel, Google Sheets or Numbers file with name, email and phone columns. Importing doesn't email anyone."
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
          <section aria-label="Lead list" className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <FilterTabs
                value={filter}
                onChange={setFilter}
                options={FILTERS}
                label="Filter leads"
              />
              <InputGroup className="h-10 w-full md:w-72">
                <InputGroupAddon>
                  <SearchIcon aria-hidden />
                </InputGroupAddon>
                <InputGroupInput
                  type="search"
                  placeholder="Search name, email or phone"
                  aria-label="Search leads"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </InputGroup>
            </div>

            {loading ? (
              <LoadingRows />
            ) : visible.length === 0 ? (
              <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                {leads.length === 0
                  ? sheet
                    ? "No leads in this sheet."
                    : "No leads for this client yet."
                  : "No leads match this filter."}
              </p>
            ) : (
              <>
                <LeadsTable leads={visible} sheetsById={sheetsById} />
                <LeadCards leads={visible} sheetsById={sheetsById} />
              </>
            )}
            {!loading && visible.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Showing {visible.length.toLocaleString()} of{" "}
                {leads.length.toLocaleString()}
                {capped &&
                  `. These are the newest ${LIST_LIMIT.toLocaleString()}: pick a client or sheet to see older leads.`}
              </p>
            )}
          </section>
        )}
      </div>
    </AppShell>
  )
}

function ClientFilter({
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
          ...clients.map((c) => ({ value: c.clientKey, label: c.client })),
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
        className="h-10 w-full sm:w-60"
        aria-label="Client"
      >
        <SelectValue placeholder="All clients" />
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

function SheetFilter({
  sheets,
  showClient,
  value,
  onChange,
}: {
  sheets: Sheet[]
  showClient: boolean
  value: string
  onChange: (v: string) => void
}) {
  const collection = React.useMemo(
    () =>
      createListCollection({
        items: [
          { value: ALL, label: "All sheets" },
          ...sheets.map((s) => ({
            value: s.id,
            label:
              showClient && s.client ? `${s.title} · ${s.client}` : s.title,
          })),
        ],
      }),
    [sheets, showClient]
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
        className="h-10 w-full sm:w-80"
        aria-label="Sheet"
      >
        <SelectValue placeholder="All sheets" />
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

/** "Skill2U · March 2026" (+1 when the person is in several sheets). */
function From({
  lead,
  sheetsById,
}: {
  lead: Lead
  sheetsById: Map<string, Sheet>
}) {
  const latest = sheetsById.get(lead.sheetIds[lead.sheetIds.length - 1] ?? "")
  const more = lead.sheetIds.length - 1
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate">{lead.client || "—"}</span>
      {latest && (
        <span className="truncate text-xs text-muted-foreground">
          {latest.title}
          {more > 0 && ` +${more}`}
        </span>
      )}
    </span>
  )
}

function FlagSummary({ lead }: { lead: Lead }) {
  if (lead.flags.length === 0)
    return <span className="text-sm text-muted-foreground">—</span>
  const [first, ...rest] = lead.flags
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1">
          <Badge variant="outline">{FLAG_SHORT[first]}</Badge>
          {rest.length > 0 && <Badge variant="outline">+{rest.length}</Badge>}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <ul className="space-y-0.5">
          {lead.flags.map((f) => (
            <li key={f}>{FLAG_LABELS[f]}</li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  )
}

function LeadsTable({
  leads,
  sheetsById,
}: {
  leads: Lead[]
  sheetsById: Map<string, Sheet>
}) {
  const router = useRouter()
  return (
    <div className="hidden overflow-hidden rounded-xl border md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>From</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Score</TableHead>
            <TableHead>Check</TableHead>
            <TableHead className="text-right">Added</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((l) => (
            <TableRow
              key={l.id}
              className="cursor-pointer"
              onClick={() => router.push(`/leads/${l.id}`)}
            >
              <TableCell className="max-w-56">
                <Link
                  href={`/leads/${l.id}`}
                  className="block truncate font-medium outline-none hover:underline focus-visible:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {l.name || "Unnamed"}
                </Link>
              </TableCell>
              <TableCell className="max-w-72">
                <span className="flex items-center gap-1.5 truncate text-muted-foreground">
                  <span className="truncate">{l.email || "—"}</span>
                  {l.workEmail && (
                    <BuildingIcon
                      className="size-3.5 shrink-0 text-info"
                      aria-label="Company email"
                    />
                  )}
                </span>
              </TableCell>
              <TableCell className="max-w-48">
                <From lead={l} sheetsById={sheetsById} />
              </TableCell>
              <TableCell>
                <StatusBadge status={l.status} />
              </TableCell>
              <TableCell>
                <ScoreBadge score={l.score} />
              </TableCell>
              <TableCell onClick={(e) => e.stopPropagation()}>
                <FlagSummary lead={l} />
              </TableCell>
              <TableCell className="text-right text-muted-foreground tabular-nums">
                {formatRelative(l.createdAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function LeadCards({
  leads,
  sheetsById,
}: {
  leads: Lead[]
  sheetsById: Map<string, Sheet>
}) {
  return (
    <ul className="flex flex-col gap-2 md:hidden">
      {leads.map((l) => (
        <li key={l.id}>
          <Link
            href={`/leads/${l.id}`}
            className="flex min-h-14 items-center gap-3 rounded-xl border bg-card px-4 py-3 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 active:bg-accent"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{l.name || "Unnamed"}</p>
              <p className="truncate text-sm text-muted-foreground">
                {l.email || "No email"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {[
                  l.client,
                  sheetsById.get(l.sheetIds[l.sheetIds.length - 1] ?? "")
                    ?.title,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <StatusBadge status={l.status} />
                {l.score && <ScoreBadge score={l.score} />}
                {l.flags.slice(0, 2).map((f) => (
                  <Badge key={f} variant="outline">
                    {FLAG_SHORT[f]}
                  </Badge>
                ))}
              </div>
            </div>
            <ChevronRightIcon
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
          </Link>
        </li>
      ))}
    </ul>
  )
}

function LoadingRows() {
  return (
    <div
      className="flex flex-col gap-2"
      role="status"
      aria-label="Loading leads"
    >
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-xl" />
      ))}
    </div>
  )
}
