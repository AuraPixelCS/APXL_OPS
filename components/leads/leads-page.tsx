"use client"

import {
  BuildingIcon,
  ChevronRightIcon,
  SearchIcon,
  TriangleAlertIcon,
  UploadIcon,
  UsersIcon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
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
import { useLeads } from "@/hooks/use-leads"
import { formatRelative } from "@/lib/format"
import { needsALook } from "@/lib/leads/clean"
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

export function LeadsPage() {
  const { data: leads, loading, error } = useLeads()
  const [filter, setFilter] = React.useState<Filter>("all")
  const [search, setSearch] = React.useState("")

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

  return (
    <AppShell
      title="Leads"
      actions={
        <Button asChild size="lg">
          <Link href="/leads/import">
            <UploadIcon />
            <span>Import CSV</span>
          </Link>
        </Button>
      }
    >
      <div className="flex flex-col gap-5 page-x py-5 sm:py-6">
        <section
          aria-label="Lead counts"
          className="grid grid-cols-2 gap-3 lg:grid-cols-4"
        >
          <StatTile label="All leads" value={loading ? "–" : counts.all} />
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

        {!loading && leads.length === 0 && !error ? (
          <EmptyState
            icon={UsersIcon}
            title="No leads yet"
            body="Import a CSV exported from Meta (or any sheet with name, email and phone columns). Importing doesn't email anyone."
            action={
              <Button asChild size="xl">
                <Link href="/leads/import">
                  <UploadIcon />
                  Import CSV
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
                No leads match this filter.
              </p>
            ) : (
              <>
                <LeadsTable leads={visible} />
                <LeadCards leads={visible} />
              </>
            )}
            {!loading && visible.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Showing {visible.length} of {leads.length}
              </p>
            )}
          </section>
        )}
      </div>
    </AppShell>
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

function LeadsTable({ leads }: { leads: Lead[] }) {
  const router = useRouter()
  return (
    <div className="hidden overflow-hidden rounded-xl border md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
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

function LeadCards({ leads }: { leads: Lead[] }) {
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
