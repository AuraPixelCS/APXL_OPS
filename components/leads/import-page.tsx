"use client"

import {
  BuildingIcon,
  CircleCheckIcon,
  FileTextIcon,
  TriangleAlertIcon,
  UploadIcon,
} from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { FilterTabs } from "@/components/common/filter-tabs"
import { StatTile } from "@/components/common/stat-tile"
import { FLAG_LABELS, FLAG_SHORT } from "@/components/leads/lead-badges"
import { AppShell } from "@/components/shell/app-shell"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  FileUpload,
  FileUploadDescription,
  FileUploadDropzone,
  FileUploadDropzoneIcon,
  FileUploadHelper,
  FileUploadTitle,
  FileUploadTrigger,
} from "@/components/ui/file-upload"
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
import { apiPost } from "@/lib/api"
import { formatPhone } from "@/lib/format"
import { cleanLead, dedupeKey, needsALook } from "@/lib/leads/clean"
import { parseCsvFile } from "@/lib/leads/csv"
import type { CleanLead, ImportResult } from "@/lib/leads/types"

const PREVIEW_LIMIT = 100

type Preview = {
  fileName: string
  rows: Record<string, string>[]
  leads: CleanLead[] // one per person, first row wins
  repeated: number
}

type View = "all" | "look" | "cant"

function buildPreview(
  fileName: string,
  rows: Record<string, string>[]
): Preview {
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
  return { fileName, rows, leads, repeated }
}

export function ImportPage() {
  const [preview, setPreview] = React.useState<Preview | null>(null)
  const [result, setResult] = React.useState<ImportResult | null>(null)
  const [reading, setReading] = React.useState(false)
  const [importing, setImporting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [view, setView] = React.useState<View>("all")

  function reset() {
    setPreview(null)
    setResult(null)
    setError(null)
    setView("all")
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    reset()
    setReading(true)
    try {
      const { rows } = await parseCsvFile(file)
      setPreview(buildPreview(file.name, rows))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that file.")
    } finally {
      setReading(false)
    }
  }

  async function onImport() {
    if (!preview) return
    setImporting(true)
    setError(null)
    try {
      setResult(
        await apiPost<ImportResult>("/api/leads/import", {
          fileName: preview.fileName,
          rows: preview.rows,
        })
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : "The import failed.")
    } finally {
      setImporting(false)
    }
  }

  return (
    <AppShell title="Import CSV">
      <div className="flex flex-col gap-5 page-x py-5 sm:py-6">
        {error && (
          <Alert variant="destructive">
            <TriangleAlertIcon />
            <AlertTitle>
              {preview ? "Import failed" : "Couldn’t read that file"}
            </AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {result ? (
          <Done result={result} onAgain={reset} />
        ) : preview ? (
          <Review
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
                "Choose a .csv file (a Meta lead export or a sheet saved as CSV)."
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
          Add leads from a CSV
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          We tidy names and phone numbers, spot fake details and skip people
          already in Ops. You&rsquo;ll see a preview before anything is saved,
          and importing never emails anyone.
        </p>
      </div>
      <FileUpload
        maxFiles={1}
        accept={{
          "text/csv": [".csv"],
          "text/tab-separated-values": [".tsv"],
          "application/vnd.ms-excel": [".csv"],
        }}
        onFileAccept={(d) => onFile(d.files[0])}
        onFileReject={() => onReject()}
        disabled={reading}
      >
        <FileUploadDropzone className="min-h-64 rounded-xl border-dashed bg-card/50">
          {reading ? (
            <Spinner className="size-6 text-muted-foreground" />
          ) : (
            <>
              <FileUploadDropzoneIcon />
              <FileUploadTitle>Drop your CSV here</FileUploadTitle>
              <FileUploadDescription>or</FileUploadDescription>
              <FileUploadTrigger asChild>
                <Button variant="outline" size="xl">
                  <FileTextIcon />
                  Choose file
                </Button>
              </FileUploadTrigger>
              <FileUploadHelper>
                Needs a name, email or phone column. Meta exports and Google
                Sheets both work.
              </FileUploadHelper>
            </>
          )}
        </FileUploadDropzone>
      </FileUpload>
    </section>
  )
}

function Review({
  preview,
  view,
  onView,
  importing,
  onImport,
  onCancel,
}: {
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

  return (
    <section className="flex flex-col gap-5" aria-label="Import preview">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <FileTextIcon className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{preview.fileName}</span>
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
            disabled={importing || preview.leads.length === 0}
          >
            {importing ? <Spinner /> : <UploadIcon />}
            {importing ? "Importing…" : `Import ${preview.leads.length} leads`}
          </Button>
        </div>
      </div>

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
            { value: "cant", label: `Can\u2019t email (${cant.length})` },
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
      `${result.alreadyInOps} already in Ops, left as they were`,
    result.duplicatesInFile > 0 &&
      `${result.duplicatesInFile} repeated rows skipped`,
  ].filter(Boolean)
  return (
    <section className="flex flex-col items-start gap-5">
      <Alert variant="success">
        <CircleCheckIcon />
        <AlertTitle>
          Imported {result.created} new{" "}
          {result.created === 1 ? "lead" : "leads"}
        </AlertTitle>
        <AlertDescription>
          {details.length > 0 ? `${details.join(" · ")}. ` : ""}Nobody has been
          emailed.
        </AlertDescription>
      </Alert>
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
        <Button asChild size="xl">
          <Link href="/leads" onClick={onAgain}>
            View leads
          </Link>
        </Button>
        <Button variant="outline" size="xl" onClick={onAgain}>
          Import another file
        </Button>
      </div>
    </section>
  )
}
