"use client"

// Pick a file of people for one blast (not imported into Leads): CSV, Excel,
// Numbers or ODS, read in the browser with the same reader as Sheets. Shows
// how many can be emailed before anything is saved.

import { createListCollection } from "@ark-ui/react/collection"
import {
  FileSpreadsheetIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
} from "lucide-react"
import * as React from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  FileUpload,
  FileUploadDescription,
  FileUploadDropzone,
  FileUploadDropzoneIcon,
  FileUploadTitle,
  FileUploadTrigger,
} from "@/components/ui/file-upload"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { emailDocId } from "@/lib/blasts/email"
import { cleanLead } from "@/lib/leads/clean"
import {
  MAX_FILE_MB,
  readSheetFile,
  SHEET_ACCEPT,
  SHEET_FORMATS,
} from "@/lib/leads/file"
import { MAX_IMPORT_ROWS, type SheetTab } from "@/lib/leads/grid"
import { titleFromFile } from "@/lib/leads/sheets"

export interface PickedList {
  fileName: string
  tabName: string
  name: string
  rows: Record<string, string>[]
}

function summarise(rows: Record<string, string>[]) {
  const seen = new Set<string>()
  let canEmail = 0
  let cant = 0
  let repeated = 0
  const names: string[] = []
  for (const row of rows) {
    const l = cleanLead(row)
    if (!l.emailOk) {
      cant++
      continue
    }
    const key = emailDocId(l.email)
    if (seen.has(key)) {
      repeated++
      continue
    }
    seen.add(key)
    canEmail++
    if (names.length < 3) names.push(l.name || l.email)
  }
  return { canEmail, cant, repeated, names }
}

export function ListUpload({
  value,
  onChange,
  error,
}: {
  value: PickedList | null
  onChange: (v: PickedList | null) => void
  error?: string
}) {
  const [file, setFile] = React.useState<{
    name: string
    tabs: SheetTab[]
  } | null>(null)
  const [reading, setReading] = React.useState(false)
  const [readError, setReadError] = React.useState<string>()

  function pickTab(f: { name: string; tabs: SheetTab[] }, i: number) {
    const tab = f.tabs[i]
    const several = f.tabs.filter((t) => t.rows.length).length > 1
    onChange({
      fileName: f.name,
      tabName: several ? tab.name : "",
      name: titleFromFile(f.name, several ? tab.name : undefined),
      rows: tab.rows,
    })
  }

  async function read(picked: File | undefined) {
    if (!picked) return
    setReading(true)
    setReadError(undefined)
    onChange(null)
    try {
      const tabs = await readSheetFile(picked)
      const f = { name: picked.name, tabs }
      setFile(f)
      pickTab(
        f,
        tabs.findIndex((t) => t.rows.length)
      )
    } catch (e) {
      setFile(null)
      setReadError(e instanceof Error ? e.message : "Couldn't read that file.")
    } finally {
      setReading(false)
    }
  }

  const summary = React.useMemo(
    () => (value ? summarise(value.rows) : null),
    [value]
  )
  const tabIndex =
    file && value
      ? Math.max(
          0,
          file.tabs.findIndex((t) => t.rows === value.rows)
        )
      : 0
  const usableTabs = file?.tabs.filter((t) => t.rows.length).length ?? 0
  const tooBig = (value?.rows.length ?? 0) > MAX_IMPORT_ROWS
  const shownError = readError ?? error

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {!value || !file ? (
        <FileUpload
          maxFiles={1}
          maxFileSize={MAX_FILE_MB * 1024 * 1024}
          accept={SHEET_ACCEPT}
          onFileAccept={(d) => void read(d.files[0])}
          onFileReject={() =>
            setReadError(`Use ${SHEET_FORMATS}, up to ${MAX_FILE_MB} MB.`)
          }
          disabled={reading}
        >
          <FileUploadDropzone className="min-h-44 rounded-xl border-dashed bg-card/50">
            {reading ? (
              <>
                <Spinner className="size-6 text-muted-foreground" />
                <FileUploadDescription>
                  Reading your file…
                </FileUploadDescription>
              </>
            ) : (
              <>
                <FileUploadDropzoneIcon />
                <FileUploadTitle>Drop a file of people here</FileUploadTitle>
                <FileUploadTrigger asChild>
                  <Button variant="outline" size="xl">
                    <FileSpreadsheetIcon />
                    Choose file
                  </Button>
                </FileUploadTrigger>
              </>
            )}
          </FileUploadDropzone>
        </FileUpload>
      ) : (
        <div className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-4">
          <div className="flex min-w-0 items-start gap-3">
            <FileSpreadsheetIcon
              className="mt-0.5 size-5 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{file.name}</p>
              {summary && (
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {summary.canEmail.toLocaleString()}{" "}
                    {summary.canEmail === 1 ? "person" : "people"}
                  </span>{" "}
                  to email
                  {summary.cant > 0 &&
                    ` · ${summary.cant} without a usable email`}
                  {summary.repeated > 0 && ` · ${summary.repeated} repeated`}
                </p>
              )}
              {summary && summary.names.length > 0 && (
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {summary.names.join(", ")}
                  {summary.canEmail > summary.names.length && "…"}
                </p>
              )}
            </div>
          </div>
          {usableTabs > 1 && (
            <TabSelect
              tabs={file.tabs}
              value={tabIndex}
              onChange={(i) => pickTab(file, i)}
            />
          )}
          <Button
            variant="outline"
            size="lg"
            className="min-h-10 self-start"
            onClick={() => {
              setFile(null)
              onChange(null)
            }}
          >
            <RefreshCwIcon />
            Choose a different file
          </Button>
        </div>
      )}
      {tooBig && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertDescription>
            This file has {value?.rows.length.toLocaleString()} rows. Upload at
            most {MAX_IMPORT_ROWS.toLocaleString()} at a time.
          </AlertDescription>
        </Alert>
      )}
      {shownError && (
        <p className="text-sm text-destructive-foreground">{shownError}</p>
      )}
    </div>
  )
}

function TabSelect({
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
    <Select
      collection={collection}
      value={[String(value)]}
      onValueChange={(d) => d.value[0] && onChange(Number(d.value[0]))}
      positioning={{ sameWidth: true }}
    >
      <SelectTrigger size="lg" className="h-10 w-full" aria-label="Which tab">
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
