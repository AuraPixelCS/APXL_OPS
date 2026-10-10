"use client"

// The client's report on a blast: a live preview of exactly what they get,
// Save as PDF, and email it (from AuraPixel, with AuraPixel's branding).

import { PrinterIcon, SendIcon } from "lucide-react"
import * as React from "react"
import { useAuth } from "@/components/auth/auth-provider"
import { CheckMark } from "@/components/common/check-mark"
import { DialogShell } from "@/components/common/dialog-shell"
import { AreaField, TextField } from "@/components/settings/form-bits"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { useSettings } from "@/hooks/use-settings"
import { ApiError, apiPost } from "@/lib/api"
import {
  type BlastReport,
  parseReportTo,
  REPORT_NOTE_MAX,
  renderReport,
  renderReportPdf,
} from "@/lib/blasts/report"
import type { Blast } from "@/lib/blasts/types"
import { reportLogoUrl } from "@/lib/blasts/urls"
import { formatRelative } from "@/lib/format"

type Loaded = { report: BlastReport; notice: string | null }

export function ReportDialog({
  blast,
  onClose,
}: {
  blast: Blast
  onClose: () => void
}) {
  const { user } = useAuth()
  const { values: sender } = useSettings("email")
  const [loaded, setLoaded] = React.useState<Loaded | null>(null)
  const [loadError, setLoadError] = React.useState<string>()
  const [to, setTo] = React.useState(blast.lastReport?.to.join(", ") ?? "")
  const [note, setNote] = React.useState("")
  const [attachList, setAttachList] = React.useState(false)
  const [copyMe, setCopyMe] = React.useState(true)
  const [errors, setErrors] = React.useState<{
    to?: string
    note?: string
    form?: string
  }>({})
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    let live = true
    apiPost<Loaded>("/api/blasts/report", { id: blast.id })
      .then((r) => live && setLoaded(r))
      .catch(
        (e) =>
          live &&
          setLoadError(e instanceof Error ? e.message : "Couldn't load it.")
      )
    return () => {
      live = false
    }
  }, [blast.id])

  const shownNote = React.useDeferredValue(note)
  const html = React.useMemo(
    () =>
      loaded
        ? renderReport(loaded.report, {
            note: shownNote,
            logoSrc: reportLogoUrl(window.location.origin),
            signature: sender.signature,
          }).html
        : "",
    [loaded, shownNote, sender.signature]
  )

  function saveAsPdf() {
    const w = window.open("", "_blank")
    if (!w) return setErrors({ form: "Allow pop-ups for Ops, then try again." })
    w.document.open()
    w.document.write(
      renderReportPdf(loaded!.report, {
        note,
        logoSrc: reportLogoUrl(window.location.origin),
        signature: sender.signature,
      })
    )
    w.document.close()
    // Print once the logo is in, or it's missing from the PDF.
    const print = () => {
      w.focus()
      w.print()
    }
    const logo = w.document.images[0]
    if (!logo || logo.complete) setTimeout(print, 100)
    else {
      logo.addEventListener("load", print, { once: true })
      logo.addEventListener("error", print, { once: true })
    }
  }

  async function send() {
    const parsed = parseReportTo(to)
    if (!parsed.ok) return setErrors({ to: parsed.error })
    if (note.length > REPORT_NOTE_MAX)
      return setErrors({
        note: `Keep it under ${REPORT_NOTE_MAX.toLocaleString()} characters.`,
      })
    setBusy(true)
    setErrors({})
    try {
      await apiPost("/api/blasts/report/send", {
        id: blast.id,
        to: parsed.to,
        note,
        attachList,
        copyMe,
      })
      toast.success({
        title: "Report sent",
        description: parsed.to.join(", "),
      })
      onClose()
    } catch (e) {
      setErrors(
        e instanceof ApiError
          ? {
              to: e.fields.to,
              note: e.fields.note,
              form: e.fields.to || e.fields.note ? undefined : e.message,
            }
          : { form: "The report didn't send." }
      )
      setBusy(false)
    }
  }

  const last = blast.lastReport

  return (
    <DialogShell
      open
      onClose={onClose}
      title="Report"
      size="xl"
      footer={
        <>
          <Button
            variant="outline"
            size="xl"
            className="sm:me-auto"
            onClick={saveAsPdf}
            disabled={!loaded}
          >
            <PrinterIcon />
            Save as PDF
          </Button>
          <Button variant="outline" size="xl" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button size="xl" onClick={send} disabled={busy || !loaded}>
            {busy ? <Spinner /> : <SendIcon />}
            Send report
          </Button>
        </>
      }
    >
      <form
        onSubmit={(ev) => {
          ev.preventDefault()
          void send()
        }}
      >
        <TextField
          label="Send to"
          inputMode="email"
          value={to}
          onChange={(v) => {
            setTo(v)
            setErrors((x) => ({ ...x, to: undefined }))
          }}
          error={errors.to}
          placeholder="name@client.com"
          helper={
            last?.sentAt
              ? `Last sent to ${last.to.join(", ")} ${formatRelative(last.sentAt)}`
              : undefined
          }
        />
      </form>
      <AreaField
        label="Note (optional)"
        rows={3}
        value={note}
        onChange={(v) => {
          setNote(v)
          setErrors((x) => ({ ...x, note: undefined }))
        }}
        error={errors.note}
        max={REPORT_NOTE_MAX}
      />
      <div className="-mx-2 flex flex-col">
        <CheckRow
          checked={attachList}
          onChange={setAttachList}
          label="Attach the list of people (CSV)"
        />
        {user?.email && (
          <CheckRow
            checked={copyMe}
            onChange={setCopyMe}
            label={`Send a copy to ${user.email}`}
          />
        )}
      </div>

      <section
        aria-label="Report preview"
        className="flex min-w-0 flex-col gap-2"
      >
        {loaded?.notice && (
          <p className="text-sm text-warning-foreground">{loaded.notice}</p>
        )}
        <div className="overflow-hidden rounded-xl border bg-muted/40">
          {loaded ? (
            <iframe
              title="Report preview"
              srcDoc={html}
              sandbox=""
              className="block h-[60dvh] min-h-96 w-full border-0 bg-white"
            />
          ) : loadError ? (
            <p className="p-4 text-sm text-destructive-foreground">
              {loadError}
            </p>
          ) : (
            <div className="flex h-[60dvh] min-h-96 flex-col gap-3 p-4">
              <Skeleton className="h-20 w-full rounded-lg" />
              <Skeleton className="h-6 w-2/3 rounded-md" />
              <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-24 rounded-lg" />
                <Skeleton className="h-24 rounded-lg" />
                <Skeleton className="h-24 rounded-lg" />
                <Skeleton className="h-24 rounded-lg" />
              </div>
            </div>
          )}
        </div>
      </section>
      {errors.form && (
        <p className="text-sm text-destructive-foreground">{errors.form}</p>
      )}
    </DialogShell>
  )
}

function CheckRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-11 min-w-0 items-center gap-3 rounded-lg px-2 text-left text-sm outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40"
    >
      <CheckMark checked={checked} />
      <span className="min-w-0 break-words">{label}</span>
    </button>
  )
}
