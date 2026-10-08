"use client"

// Import a sheet: pick a file (CSV, Excel, Numbers, ODS), choose the tab when a
// workbook has several, give it a title and a client, check the cleaned
// preview, import. Nothing is emailed.

import { createListCollection } from "@ark-ui/react/collection"
import {
  BuildingIcon,
  CircleCheckIcon,
  FileSpreadsheetIcon,
  TriangleAlertIcon,
  UploadIcon,
} from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { FilterTabs } from "@/components/common/filter-tabs"
import { StatTile } from "@/components/common/stat-tile"
import { FLAG_LABELS, FLAG_SHORT } from "@/components/leads/lead-badges"
import { SectionCard, TextField } from "@/components/settings/form-bits"
import { AppShell } from "@/components/shell/app-shell"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldError,
  FieldHelper,
  FieldLabel,
} from "@/components/ui/field"
import {
  FileUpload,
  FileUploadDescription,
  FileUploadDropzone,
  FileUploadDropzoneIcon,
  FileUploadHelper,
  FileUploadTitle,
  FileUploadTrigger,
} from "@/components/ui/file-upload"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import { useSheets } from "@/hooks/use-sheets"
import { ApiError, apiPost } from "@/lib/api"
import { formatPhone } from "@/lib/format"
import { cleanLead, dedupeKey, needsALook } from "@/lib/leads/clean"
import {
  MAX_FILE_MB,
  readSheetFile,
  SHEET_ACCEPT,
  SHEET_FORMATS,
} from "@/lib/leads/file"
import { MAX_IMPORT_ROWS, type SheetTab } from "@/lib/leads/grid"
import {
  clientKeyOf,
  guessClient,
  tidyName,
  titleFromFile,
  validateSheetDetails,
} from "@/lib/leads/sheets"
import type { CleanLead, ImportResult } from "@/lib/leads/types"
import type { OpsUser } from "@/lib/users"

const PREVIEW_LIMIT = 100
/** AuraPixel's own leads are filed under this client. */
const OWN_CLIENT = "AuraPixel"

type Preview = {
  leads: CleanLead[] // one per person, first row wins
  repeated: number
}

type View = "all" | "look" | "cant"

type Details = { title?: string; client?: string }

function buildPreview(rows: Record<string, string>[]): Preview {
  const seen = new Set<string>()
  const leads: CleanLead[] = []
  let repeated = 0
  for (const row of rows) {
    const lead = cleanLead(row)
    const key = dedupeKey(lead)
    if (key && seen.has(key)) {
      repeated++
      continue
    }
    if (key) seen.add(key)
    leads.push(lead)
  }
  return { leads, repeated }
}

/** Businesses on client accounts (Settings → Users), as extra suggestions. */
function useAccountClients(): string[] {
  const [names, setNames] = React.useState<string[]>([])
  React.useEffect(() => {
    let cancelled = false
    apiPost<{ users: OpsUser[] }>("/api/users/list", {})
      .then(({ users }) => {
        if (!cancelled)
          setNames(
            users
              .filter((u) => u.role === "client" && u.company)
              .map((u) => u.company)
          )
      })
      .catch(() => {}) // suggestions only
    return () => {
      cancelled = true
    }
  }, [])
  return names
}

export function ImportPage() {
  const [file, setFile] = React.useState<{
    name: string
    tabs: SheetTab[]
  } | null>(null)
  const [tabIndex, setTabIndex] = React.useState(0)
  const [title, setTitle] = React.useState("")
  const [titleEdited, setTitleEdited] = React.useState(false)
  // null = not typed yet: show the client guessed from the file name, which
  // can only be worked out once the client list has loaded.
  const [typedClient, setTypedClient] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Details>({})
  const [result, setResult] = React.useState<ImportResult | null>(null)
  const [reading, setReading] = React.useState(false)
  const [importing, setImporting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [view, setView] = React.useState<View>("all")

  const { clients: sheetClients } = useSheets()
  const accountClients = useAccountClients()
  const clientOptions = React.useMemo(() => {
    const out = new Map<string, string>()
    for (const name of [
      ...sheetClients.map((c) => c.client),
      ...accountClients,
      OWN_CLIENT,
    ]) {
      const key = clientKeyOf(name)
      if (key && !out.has(key)) out.set(key, tidyName(name))
    }
    return [...out.values()]
  }, [sheetClients, accountClients])

  const tab = file?.tabs[tabIndex] ?? null
  const preview = React.useMemo(
    () => (tab ? buildPreview(tab.rows) : null),
    [tab]
  )
  const usableTabs = file?.tabs.filter((t) => t.rows.length).length ?? 0
  const client =
    typedClient ?? (file ? (guessClient(file.name, clientOptions) ?? "") : "")

  function reset() {
    setFile(null)
    setTabIndex(0)
    setTitle("")
    setTitleEdited(false)
    setTypedClient(null)
    setFieldErrors({})
    setResult(null)
    setError(null)
    setView("all")
  }

  async function onFile(picked: File | undefined) {
    if (!picked) return
    reset()
    setReading(true)
    try {
      const tabs = await readSheetFile(picked)
      const first = tabs.findIndex((t) => t.rows.length)
      const several = tabs.filter((t) => t.rows.length).length > 1
      setFile({ name: picked.name, tabs })
      setTabIndex(first)
      setTitle(
        titleFromFile(picked.name, several ? tabs[first].name : undefined)
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that file.")
    } finally {
      setReading(false)
    }
  }

  function onTab(i: number) {
    if (!file) return
    setTabIndex(i)
    setView("all")
    if (!titleEdited) setTitle(titleFromFile(file.name, file.tabs[i].name))
  }

  async function onImport() {
    if (!file || !tab) return
    const details = validateSheetDetails({ title, client })
    if (!details.ok) {
      setFieldErrors(details.errors)
      return
    }
    setFieldErrors({})
    setImporting(true)
    setError(null)
    try {
      setResult(
        await apiPost<ImportResult>("/api/leads/import", {
          title: details.title,
          client: details.client,
          fileName: file.name,
          // "Sheet1" of a one-tab workbook says nothing; keep real tab names.
          tabName: usableTabs > 1 ? tab.name : "",
          rows: tab.rows,
        })
      )
    } catch (e) {
      if (e instanceof ApiError) setFieldErrors(e.fields)
      setError(e instanceof Error ? e.message : "The import failed.")
    } finally {
      setImporting(false)
    }
  }

  return (
    <AppShell title="Import a sheet">
      <div className="flex flex-col gap-5 page-x py-5 sm:py-6">
        {error && (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>
              {file ? "Import failed" : "Couldn’t read that file"}
            </AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {result ? (
          <Done result={result} onAgain={reset} />
        ) : file && tab && preview ? (
          <Review
            fileName={file.name}
            tabs={file.tabs}
            tabIndex={tabIndex}
            onTab={usableTabs > 1 ? onTab : undefined}
            title={title}
            onTitle={(v) => {
              setTitle(v)
              setTitleEdited(true)
              setFieldErrors((e) => ({ ...e, title: undefined }))
            }}
            client={client}
            onClient={(v) => {
              setTypedClient(v)
              setFieldErrors((e) => ({ ...e, client: undefined }))
            }}
            clientOptions={clientOptions}
            fieldErrors={fieldErrors}
            rowCount={tab.rows.length}
            preview={preview}
            view={view}
            onView={setView}
            importing={importing}
            onImport={onImport}
            onCancel={reset}
          />
        ) : (
          <Pick
            reading={reading}
            onFile={onFile}
            onReject={() =>
              setError(
                `That file type isn't supported. Use ${SHEET_FORMATS}, up to ${MAX_FILE_MB} MB.`
              )
            }
          />
        )}
      </div>
    </AppShell>
  )
}

function Pick({
  reading,
  onFile,
  onReject,
}: {
  reading: boolean
  onFile: (f: File | undefined) => void
  onReject: () => void
}) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-xl font-semibold tracking-tight">
          Import a lead sheet
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Each file becomes a sheet with a title and a client, so you can find
          its leads later. We tidy names and phone numbers, spot fake details
          and skip people the client already has. You&rsquo;ll see a preview
          before anything is saved, and importing never emails anyone.
        </p>
      </div>
      <FileUpload
        maxFiles={1}
        maxFileSize={MAX_FILE_MB * 1024 * 1024}
        accept={SHEET_ACCEPT}
        onFileAccept={(d) => onFile(d.files[0])}
        onFileReject={() => onReject()}
        disabled={reading}
      >
        <FileUploadDropzone className="min-h-64 rounded-xl border-dashed bg-card/50">
          {reading ? (
            <>
              <Spinner className="size-6 text-muted-foreground" />
              <FileUploadDescription>Reading your file…</FileUploadDescription>
            </>
          ) : (
            <>
              <FileUploadDropzoneIcon />
              <FileUploadTitle>Drop your file here</FileUploadTitle>
              <FileUploadDescription>or</FileUploadDescription>
              <FileUploadTrigger asChild>
                <Button variant="outline" size="xl">
                  <FileSpreadsheetIcon />
                  Choose file
                </Button>
              </FileUploadTrigger>
              <FileUploadHelper>
                {SHEET_FORMATS}. Needs a name, email or phone column.
              </FileUploadHelper>
            </>
          )}
        </FileUploadDropzone>
      </FileUpload>
    </section>
  )
}

function TabPicker({
  tabs,
  value,
  onChange,
}: {
  tabs: SheetTab[]
  value: number
  onChange: (i: number) => void
}) {
  const collection = React.useMemo(
    () =>
      createListCollection({
        items: tabs.map((t, i) => ({
          value: String(i),
          label: `${t.name} · ${t.rows.length} ${t.rows.length === 1 ? "row" : "rows"}`,
          disabled: t.rows.length === 0,
        })),
      }),
    [tabs]
  )
  return (
    <Field>
      <FieldLabel>Which tab?</FieldLabel>
      <Select
        collection={collection}
        value={[String(value)]}
        onValueChange={(d) => d.value[0] && onChange(Number(d.value[0]))}
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
      <FieldHelper>
        This file has {tabs.length} tabs. Import each one as its own sheet.
      </FieldHelper>
    </Field>
  )
}

function ClientField({
  value,
  onChange,
  options,
  error,
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
  error?: string
}) {
  const key = clientKeyOf(value)
  const isNew = Boolean(key) && !options.some((o) => clientKeyOf(o) === key)
  return (
    <Field invalid={Boolean(error)}>
      <FieldLabel>Client</FieldLabel>
      <Input
        size="lg"
        className="h-10"
        value={value}
        placeholder="Who are these leads for?"
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
      />
      {options.length > 0 && (
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Pick a client"
        >
          {options.map((o) => {
            const on = clientKeyOf(o) === key
            return (
              <Button
                key={o}
                type="button"
                size="lg"
                variant={on ? "default" : "outline"}
                aria-pressed={on}
                onClick={() => onChange(o)}
              >
                {o}
              </Button>
            )
          })}
        </div>
      )}
      {!error && (
        <FieldHelper>
          {isNew
            ? `New client: “${tidyName(value)}” will be added.`
            : "People this client already has aren’t added twice."}
        </FieldHelper>
      )}
      <FieldError>{error}</FieldError>
    </Field>
  )
}

function Review({
  fileName,
  tabs,
  tabIndex,
  onTab,
  title,
  onTitle,
  client,
  onClient,
  clientOptions,
  fieldErrors,
  rowCount,
  preview,
  view,
  onView,
  importing,
  onImport,
  onCancel,
}: {
  fileName: string
  tabs: SheetTab[]
  tabIndex: number
  onTab?: (i: number) => void
  title: string
  onTitle: (v: string) => void
  client: string
  onClient: (v: string) => void
  clientOptions: string[]
  fieldErrors: Details
  rowCount: number
  preview: Preview
  view: View
  onView: (v: View) => void
  importing: boolean
  onImport: () => void
  onCancel: () => void
}) {
  const look = preview.leads.filter(needsALook)
  const cant = preview.leads.filter((l) => !l.emailOk)
  const ready = preview.leads.length - look.length - cant.length
  const shown = view === "look" ? look : view === "cant" ? cant : preview.leads
  const tooBig = rowCount > MAX_IMPORT_ROWS

  return (
    <section className="flex flex-col gap-5" aria-label="Import preview">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <FileSpreadsheetIcon className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{fileName}</span>
          </p>
          <h1 className="font-heading text-xl font-semibold tracking-tight">
            {preview.leads.length}{" "}
            {preview.leads.length === 1 ? "person" : "people"} ready to import
          </h1>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button
            variant="outline"
            size="xl"
            onClick={onCancel}
            disabled={importing}
          >
            Choose a different file
          </Button>
          <Button
            size="xl"
            onClick={onImport}
            disabled={importing || tooBig || preview.leads.length === 0}
          >
            {importing ? <Spinner /> : <UploadIcon />}
            {importing
              ? "Importing…"
              : `Import ${preview.leads.length} ${preview.leads.length === 1 ? "lead" : "leads"}`}
          </Button>
        </div>
      </div>

      <SectionCard
        title="Sheet details"
        description="How this sheet shows up in Sheets and in the Leads filters."
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="flex flex-col gap-5">
            {onTab && (
              <TabPicker tabs={tabs} value={tabIndex} onChange={onTab} />
            )}
            <TextField
              label="Title"
              value={title}
              onChange={onTitle}
              error={fieldErrors.title}
              placeholder="e.g. Skill2U leads, March 2026"
              helper="Filled in from the file name. Change it to anything."
            />
          </div>
          <ClientField
            value={client}
            onChange={onClient}
            options={clientOptions}
            error={fieldErrors.client}
          />
        </div>
      </SectionCard>

      {tooBig && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>This sheet is too big to import at once</AlertTitle>
          <AlertDescription>
            It has {rowCount.toLocaleString()} rows. Import at most{" "}
            {MAX_IMPORT_ROWS.toLocaleString()} at a time: split it into smaller
            files.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Ready to email" value={ready} tone="brand" />
        <StatTile
          label="Needs a look"
          value={look.length}
          tone="warning"
          hint="Fake name or made-up email"
        />
        <StatTile
          label="Can’t email"
          value={cant.length}
          tone="muted"
          hint="Saved, but no usable email"
        />
        <StatTile
          label="Repeated in file"
          value={preview.repeated}
          tone="muted"
          hint="Skipped: same person twice"
        />
      </div>

      <div className="flex flex-col gap-3">
        <FilterTabs
          value={view}
          onChange={onView}
          label="Filter preview"
          options={[
            { value: "all", label: `All (${preview.leads.length})` },
            { value: "look", label: `Needs a look (${look.length})` },
            { value: "cant", label: `Can’t email (${cant.length})` },
          ]}
        />

        {shown.length === 0 ? (
          <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
            Nothing in this group.
          </p>
        ) : (
          <PreviewRows leads={shown.slice(0, PREVIEW_LIMIT)} />
        )}
        {shown.length > PREVIEW_LIMIT && (
          <p className="text-xs text-muted-foreground">
            Showing the first {PREVIEW_LIMIT} of {shown.length}. All of them
            will be imported.
          </p>
        )}
      </div>
    </section>
  )
}

function Flags({ lead }: { lead: CleanLead }) {
  if (lead.flags.length === 0)
    return <span className="text-sm text-muted-foreground">—</span>
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex flex-wrap gap-1">
          {lead.flags.map((f) => (
            <Badge key={f} variant="outline">
              {FLAG_SHORT[f]}
            </Badge>
          ))}
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

function PreviewRows({ leads }: { leads: CleanLead[] }) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Check</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map((l, i) => (
              <TableRow key={`${l.email}-${l.phone}-${i}`}>
                <TableCell className="max-w-56">
                  <span className="block truncate font-medium">
                    {l.name || "—"}
                  </span>
                  {l.greetingName === "there" && (
                    <span className="block text-xs text-muted-foreground">
                      Emails will say &ldquo;Hi there&rdquo;
                    </span>
                  )}
                </TableCell>
                <TableCell className="max-w-72">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="truncate">{l.email || "—"}</span>
                    {l.workEmail && (
                      <BuildingIcon
                        className="size-3.5 shrink-0 text-info"
                        aria-label="Company email"
                      />
                    )}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                  {l.phone ? formatPhone(l.phone) : "—"}
                </TableCell>
                <TableCell>
                  <Flags lead={l} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ul className="flex flex-col gap-2 md:hidden">
        {leads.map((l, i) => (
          <li
            key={`${l.email}-${l.phone}-${i}`}
            className="rounded-xl border bg-card px-4 py-3"
          >
            <p className="truncate font-medium">{l.name || "—"}</p>
            <p className="truncate text-sm text-muted-foreground">
              {l.email || "No email"}
            </p>
            {l.phone && (
              <p className="text-sm text-muted-foreground tabular-nums">
                {formatPhone(l.phone)}
              </p>
            )}
            {l.flags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {l.flags.map((f) => (
                  <Badge key={f} variant="outline">
                    {FLAG_SHORT[f]}
                  </Badge>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}

function Done({
  result,
  onAgain,
}: {
  result: ImportResult
  onAgain: () => void
}) {
  const details = [
    result.alreadyInOps > 0 &&
      `${result.alreadyInOps} ${result.alreadyInOps === 1 ? "person was" : "people were"} already in Ops for ${result.client}: they’re now listed under this sheet too`,
    result.duplicatesInFile > 0 &&
      `${result.duplicatesInFile} repeated ${result.duplicatesInFile === 1 ? "row" : "rows"} skipped`,
  ].filter(Boolean)
  return (
    <section className="flex flex-col items-start gap-5">
      <Alert variant="success">
        <CircleCheckIcon />
        <AlertTitle>
          Imported {result.created} new{" "}
          {result.created === 1 ? "lead" : "leads"} into &ldquo;{result.title}
          &rdquo;
        </AlertTitle>
        <AlertDescription>
          Client: {result.client}.{" "}
          {details.length > 0 ? `${details.join(". ")}. ` : ""}Nobody has been
          emailed.
        </AlertDescription>
      </Alert>
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
        <Button asChild size="xl">
          <Link href={`/leads?sheet=${result.importId}`} onClick={onAgain}>
            View this sheet&rsquo;s leads
          </Link>
        </Button>
        <Button variant="outline" size="xl" onClick={onAgain}>
          Import another file
        </Button>
        <Button asChild variant="ghost" size="xl">
          <Link href="/sheets" onClick={onAgain}>
            All sheets
          </Link>
        </Button>
      </div>
    </section>
  )
}
