"use client"

// Write the blast's email: sender, subject, then either Ops' simple layout
// (banner, message, button, footer) or the client's own custom design (HTML),
// with a live preview rendered by the same code that sends it, and a test send.

import {
  BoldIcon,
  ImageIcon,
  LinkIcon,
  ListIcon,
  MonitorIcon,
  SendIcon,
  SmartphoneIcon,
  Trash2Icon,
  UserRoundIcon,
} from "lucide-react"
import * as React from "react"
import { CustomDesign } from "@/components/blasts/custom-design"
import type { BlastEmailForm } from "@/components/blasts/use-blast-email-form"
import { useAuth } from "@/components/auth/auth-provider"
import { DialogShell } from "@/components/common/dialog-shell"
import { FilterTabs } from "@/components/common/filter-tabs"
import {
  AreaField,
  SaveBar,
  SectionCard,
  TextField,
} from "@/components/settings/form-bits"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { FileUpload, FileUploadTrigger } from "@/components/ui/file-upload"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { ApiError, apiPost } from "@/lib/api"
import { withBasePath } from "@/lib/base-path"
import {
  BLAST_LIMITS,
  BLAST_PLACEHOLDER,
  type BlastEmail,
  renderBlastEmail,
} from "@/lib/blasts/email"
import { prepareBanner } from "@/lib/blasts/image"
import type { Blast } from "@/lib/blasts/types"
import { cn } from "@/lib/utils"

type Pane = "edit" | "preview"

export function EmailTab({
  blast,
  form,
  sampleName,
}: {
  blast: Blast
  form: BlastEmailForm
  sampleName: string
}) {
  const [pane, setPane] = React.useState<Pane>("edit")
  const [testing, setTesting] = React.useState(false)
  const { values: v, errors: e, set } = form

  return (
    <div className="flex flex-col gap-5">
      <FilterTabs
        value={pane}
        onChange={setPane}
        label="Edit or preview"
        className="lg:hidden"
        options={[
          { value: "edit", label: "Edit" },
          { value: "preview", label: "Preview" },
        ]}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div
          className={cn(
            "flex min-w-0 flex-col gap-5",
            pane === "preview" && "max-lg:hidden"
          )}
        >
          <SectionCard title="From">
            <TextField
              label="Sender name"
              value={v.fromName}
              onChange={(x) => set("fromName", x)}
              error={e.fromName}
              placeholder="AuraPixel"
            />
            <TextField
              label="Sender email"
              type="email"
              inputMode="email"
              value={v.fromEmail}
              onChange={(x) => set("fromEmail", x)}
              error={e.fromEmail}
              placeholder="hello@aurapixel.live"
            />
            <TextField
              label="Replies go to (optional)"
              type="email"
              inputMode="email"
              value={v.replyTo}
              onChange={(x) => set("replyTo", x)}
              error={e.replyTo}
              placeholder={v.fromEmail || "Same as the sender"}
            />
          </SectionCard>

          <SectionCard title="Subject">
            <TextField
              label="Subject line"
              value={v.subject}
              onChange={(x) => set("subject", x)}
              error={e.subject}
              placeholder="e.g. {name}, your seat for the March workshop"
            />
            <TextField
              label="Preview text (optional)"
              value={v.preheader}
              onChange={(x) => set("preheader", x)}
              error={e.preheader}
            />
          </SectionCard>

          <SectionCard title="Layout">
            <FilterTabs
              value={v.design}
              onChange={(d) => set("design", d)}
              label="Layout"
              options={[
                { value: "standard", label: "Simple layout" },
                { value: "custom", label: "Custom design" },
              ]}
            />
          </SectionCard>

          {v.design === "custom" ? (
            <CustomDesign blastId={blast.id} form={form} />
          ) : (
            <StandardSections blast={blast} form={form} />
          )}
        </div>

        <div
          className={cn(
            "min-w-0 lg:sticky lg:top-[4.5rem] lg:self-start",
            pane === "edit" && "max-lg:hidden"
          )}
        >
          <EmailPreview
            email={v}
            sampleName={sampleName}
            onTest={() => setTesting(true)}
          />
        </div>
      </div>

      <SaveBar
        dirty={form.dirty}
        saving={form.saving}
        onSave={() => void form.save()}
        onDiscard={form.discard}
        saved
        updatedAt={blast.updatedAt}
        updatedBy={blast.updatedBy}
      />

      {testing && (
        <TestDialog
          blast={blast}
          form={form}
          onClose={() => setTesting(false)}
        />
      )}
    </div>
  )
}

/** Ops' own layout: banner, message, button, footer. */
function StandardSections({
  blast,
  form,
}: {
  blast: Blast
  form: BlastEmailForm
}) {
  const { values: v, errors: e, set } = form
  return (
    <>
      <SectionCard title="Banner (optional)">
        <BannerField blastId={blast.id} form={form} />
      </SectionCard>

      <SectionCard title="Message">
        <TextField
          label="Heading (optional)"
          value={v.heading}
          onChange={(x) => set("heading", x)}
          error={e.heading}
        />
        <BodyField
          value={v.body}
          onChange={(x) => set("body", x)}
          error={e.body}
        />
      </SectionCard>

      <SectionCard title="Button (optional)">
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            label="Button text"
            value={v.buttonLabel}
            onChange={(x) => set("buttonLabel", x)}
            error={e.buttonLabel}
            placeholder="Book your seat"
          />
          <TextField
            label="Button link"
            type="url"
            inputMode="url"
            value={v.buttonUrl}
            onChange={(x) => set("buttonUrl", x)}
            error={e.buttonUrl}
            placeholder="https://"
          />
        </div>
        <ColorField
          value={v.buttonColor}
          onChange={(x) => set("buttonColor", x)}
          error={e.buttonColor}
        />
      </SectionCard>

      <SectionCard title="Footer">
        <AreaField
          label="Small print"
          rows={3}
          value={v.footer}
          onChange={(x) => set("footer", x)}
          error={e.footer}
          max={BLAST_LIMITS.footer}
        />
      </SectionCard>
    </>
  )
}

// ── Body with a small formatting toolbar ───────────────────────────────────

type Edit = { text: string; start: number; end: number }
type ToolKind = "bold" | "link" | "list" | "name"

const TOOLS: { kind: ToolKind; label: string; icon: typeof BoldIcon }[] = [
  { kind: "bold", label: "Bold", icon: BoldIcon },
  { kind: "link", label: "Link", icon: LinkIcon },
  { kind: "list", label: "Bullet list", icon: ListIcon },
  { kind: "name", label: "Insert first name", icon: UserRoundIcon },
]

function BodyField({
  value,
  onChange,
  error,
}: {
  value: string
  onChange: (v: string) => void
  error?: string
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null)

  function apply(fn: (text: string, start: number, end: number) => Edit) {
    const el = ref.current
    if (!el) return
    const r = fn(el.value, el.selectionStart, el.selectionEnd)
    onChange(r.text)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(r.start, r.end)
    })
  }

  function runTool(kind: ToolKind) {
    if (kind === "bold")
      apply((t, s, e) => {
        const sel = t.slice(s, e) || "bold text"
        return {
          text: `${t.slice(0, s)}**${sel}**${t.slice(e)}`,
          start: s + 2,
          end: s + 2 + sel.length,
        }
      })
    if (kind === "link")
      apply((t, s, e) => {
        const sel = t.slice(s, e) || "link text"
        const urlStart = s + sel.length + 3
        return {
          text: `${t.slice(0, s)}[${sel}](https://)${t.slice(e)}`,
          start: urlStart,
          end: urlStart + 8,
        }
      })
    if (kind === "list")
      apply((t, s, e) => {
        const lineStart = t.lastIndexOf("\n", s - 1) + 1
        const listed = t
          .slice(lineStart, e)
          .split("\n")
          .map((l) => (/^\s*[-•*]\s/.test(l) ? l : `- ${l}`))
          .join("\n")
        const end = lineStart + listed.length
        return {
          text: t.slice(0, lineStart) + listed + t.slice(e),
          start: end,
          end,
        }
      })
    if (kind === "name")
      apply((t, s, e) => {
        const at = s + BLAST_PLACEHOLDER.length
        return {
          text: t.slice(0, s) + BLAST_PLACEHOLDER + t.slice(e),
          start: at,
          end: at,
        }
      })
  }

  return (
    <Field invalid={Boolean(error)}>
      <FieldLabel>Message</FieldLabel>
      <div
        className="flex flex-wrap gap-1"
        role="toolbar"
        aria-label="Formatting"
      >
        {TOOLS.map((t) => (
          <Button
            key={t.label}
            type="button"
            variant="outline"
            size="icon-xl"
            aria-label={t.label}
            title={t.label}
            onClick={() => runTool(t.kind)}
          >
            <t.icon />
          </Button>
        ))}
      </div>
      <Textarea
        ref={ref}
        rows={12}
        value={value}
        onChange={(ev) => onChange(ev.target.value)}
        className="min-h-56 leading-relaxed"
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <FieldError>{error}</FieldError>
        </div>
        <span
          className={cn(
            "shrink-0 text-xs text-muted-foreground tabular-nums",
            value.length > BLAST_LIMITS.body && "text-destructive-foreground"
          )}
        >
          {value.length.toLocaleString()} / {BLAST_LIMITS.body.toLocaleString()}
        </span>
      </div>
    </Field>
  )
}

// ── Banner ─────────────────────────────────────────────────────────────────

function BannerField({
  blastId,
  form,
}: {
  blastId: string
  form: BlastEmailForm
}) {
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string>()
  const { values: v, set } = form

  async function upload(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError(undefined)
    try {
      const data = await prepareBanner(file)
      const { id } = await apiPost<{ id: string }>("/api/blasts/banner", {
        blastId,
        data,
      })
      set("bannerId", id)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't upload that image.")
    } finally {
      setBusy(false)
    }
  }

  const picker = (label: string, variant: "default" | "outline") => (
    <FileUpload
      maxFiles={1}
      accept="image/jpeg,image/png,image/gif,image/webp"
      onFileAccept={(d) => void upload(d.files[0])}
      onFileReject={() => setError("Use a JPG, PNG, GIF or WebP image.")}
      disabled={busy}
    >
      <FileUploadTrigger asChild>
        <Button variant={variant} size="xl" disabled={busy}>
          {busy ? <Spinner /> : <ImageIcon />}
          {busy ? "Uploading…" : label}
        </Button>
      </FileUploadTrigger>
    </FileUpload>
  )

  return (
    <div className="flex flex-col gap-4">
      {v.bannerId ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- served from our API */}
          <img
            src={withBasePath(`/api/blasts/banner/${v.bannerId}`)}
            alt="Banner"
            className="w-full rounded-lg border bg-muted object-cover"
          />
          <div className="flex flex-wrap gap-2">
            {picker("Replace", "outline")}
            <Button
              variant="ghost"
              size="xl"
              onClick={() => set("bannerId", "")}
              disabled={busy}
            >
              <Trash2Icon />
              Remove
            </Button>
          </div>
          <TextField
            label="When someone taps the banner, open (optional)"
            type="url"
            inputMode="url"
            value={v.bannerLink}
            onChange={(x) => set("bannerLink", x)}
            error={form.errors.bannerLink}
            placeholder="https://"
          />
        </>
      ) : (
        <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed p-4">
          {picker("Add a banner image", "outline")}
        </div>
      )}
      {(error || form.errors.bannerId) && (
        <p className="text-sm text-destructive-foreground">
          {error ?? form.errors.bannerId}
        </p>
      )}
    </div>
  )
}

// ── Button colour ──────────────────────────────────────────────────────────

function ColorField({
  value,
  onChange,
  error,
}: {
  value: string
  onChange: (v: string) => void
  error?: string
}) {
  const valid = /^#[0-9a-f]{6}$/i.test(value)
  return (
    <Field invalid={Boolean(error)}>
      <FieldLabel>Button colour</FieldLabel>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label="Pick a colour"
          value={valid ? value : "#0272e2"}
          onChange={(e) => onChange(e.target.value)}
          className="size-10 shrink-0 cursor-pointer rounded-lg border bg-transparent p-1"
        />
        <Input
          size="lg"
          className="h-10 max-w-40 font-mono"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Colour code"
        />
      </div>
      <FieldError>{error}</FieldError>
    </Field>
  )
}

// ── Preview ────────────────────────────────────────────────────────────────

// The preview iframe is sandboxed (an opaque origin), so it can't reuse the
// page's image cache: with a plain URL every keystroke downloaded the banner
// again, one request per character, until Vercel's bot protection started
// refusing the browser with 403s (saves failed, the banner broke). Each banner
// is fetched once and handed to the iframe as a data: URL.
const bannerCache = new Map<string, Promise<string>>()

function loadBanner(id: string): Promise<string> {
  let data = bannerCache.get(id)
  if (!data) {
    data = fetch(withBasePath(`/api/blasts/banner/${id}`))
      .then((res) =>
        res.ok ? res.blob() : Promise.reject(new Error(String(res.status)))
      )
      .then(
        (blob) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(String(reader.result))
            reader.onerror = () => reject(reader.error)
            reader.readAsDataURL(blob)
          })
      )
    data.catch(() => bannerCache.delete(id))
    bannerCache.set(id, data)
  }
  return data
}

/** Our uploaded images (banner, or a custom design's), on any host. */
const ASSET_RE = new RegExp(
  `(?:https?://[^\\s"'()<>]*?)?${withBasePath("/api/blasts/banner/").replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}([A-Za-z0-9]{10,40})`,
  "g"
)
const BLANK_GIF =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"

/** Each uploaded image as a data: URL, once loaded (its link if it can't be). */
function useAssetDataUrls(ids: string[]): Record<string, string> {
  const key = [...new Set(ids)].sort().join(",")
  const [loaded, setLoaded] = React.useState<Record<string, string>>({})
  React.useEffect(() => {
    let live = true
    for (const id of key ? key.split(",") : [])
      loadBanner(id).then(
        (src) => live && setLoaded((m) => (m[id] ? m : { ...m, [id]: src })),
        () =>
          live &&
          setLoaded((m) => ({
            ...m,
            [id]: withBasePath(`/api/blasts/banner/${id}`),
          }))
      )
    return () => {
      live = false
    }
  }, [key])
  return loaded
}

function EmailPreview({
  email,
  sampleName,
  onTest,
}: {
  email: BlastEmail
  sampleName: string
  onTest: () => void
}) {
  const [device, setDevice] = React.useState<"desktop" | "phone">("desktop")
  // Typing re-renders the iframe; deferring lets fast typing skip frames.
  const shown = React.useDeferredValue(email)
  const rendered = React.useMemo(
    () =>
      renderBlastEmail(shown, {
        name: sampleName,
        bannerSrc: shown.bannerId
          ? withBasePath(`/api/blasts/banner/${shown.bannerId}`)
          : "",
        unsubscribeUrl: "#",
      }).html,
    [shown, sampleName]
  )
  const assets = useAssetDataUrls(
    React.useMemo(
      () => [...rendered.matchAll(ASSET_RE)].map((m) => m[1]),
      [rendered]
    )
  )
  const html = React.useMemo(() => {
    const local = rendered.replace(
      ASSET_RE,
      (_, id: string) => assets[id] ?? BLANK_GIF
    )
    // Links open in a new tab instead of inside the preview.
    const base = '<base target="_blank">'
    return /<head\b[^>]*>/i.test(local)
      ? local.replace(/<head\b[^>]*>/i, (tag) => tag + base)
      : base + local
  }, [rendered, assets])
  const subject = email.subject.replaceAll(
    BLAST_PLACEHOLDER,
    sampleName || "there"
  )

  return (
    <section
      aria-label="Email preview"
      className="flex flex-col overflow-hidden rounded-xl border bg-card"
    >
      <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 text-sm">
          <p className="truncate font-medium">
            {email.fromName || "Sender"}{" "}
            <span className="font-normal text-muted-foreground">
              &lt;{email.fromEmail || "sender@…"}&gt;
            </span>
          </p>
          <p className="truncate">
            {subject || (
              <span className="text-muted-foreground">No subject yet</span>
            )}
          </p>
          {email.preheader && (
            <p className="truncate text-xs text-muted-foreground">
              {email.preheader}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden sm:block">
            <FilterTabs
              value={device}
              onChange={setDevice}
              label="Preview size"
              options={[
                {
                  value: "desktop",
                  label: (
                    <MonitorIcon className="size-4" aria-label="Computer" />
                  ),
                },
                {
                  value: "phone",
                  label: (
                    <SmartphoneIcon className="size-4" aria-label="Phone" />
                  ),
                },
              ]}
            />
          </div>
          <Button variant="outline" size="xl" onClick={onTest}>
            <SendIcon />
            Send a test
          </Button>
        </div>
      </div>
      <div className="flex justify-center bg-muted/40">
        <iframe
          title="Email preview"
          srcDoc={html}
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          className="h-[70dvh] min-h-96 w-full border-0 bg-white transition-[max-width]"
          style={{ maxWidth: device === "phone" ? 390 : undefined }}
        />
      </div>
    </section>
  )
}

// ── Test send ──────────────────────────────────────────────────────────────

function TestDialog({
  blast,
  form,
  onClose,
}: {
  blast: Blast
  form: BlastEmailForm
  onClose: () => void
}) {
  const { user } = useAuth()
  const [to, setTo] = React.useState(user?.email ?? "")
  const [error, setError] = React.useState<string>()
  const [busy, setBusy] = React.useState(false)

  async function send() {
    setBusy(true)
    setError(undefined)
    try {
      await apiPost("/api/blasts/test", {
        id: blast.id,
        email: form.values,
        to,
      })
      toast.success({
        title: "Test sent",
        description: `Check ${to} in a minute (and the spam folder).`,
      })
      onClose()
    } catch (e) {
      if (e instanceof ApiError) {
        const { to: toErr, ...fields } = e.fields
        if (Object.keys(fields).length) form.setErrors(fields)
        setError(toErr ?? e.message)
      } else setError("The test didn't send.")
      setBusy(false)
    }
  }

  return (
    <DialogShell
      open
      onClose={onClose}
      title="Send a test"
      footer={
        <>
          <Button variant="outline" size="xl" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button size="xl" onClick={send} disabled={busy}>
            {busy ? <Spinner /> : <SendIcon />}
            Send test
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
          type="email"
          inputMode="email"
          value={to}
          onChange={setTo}
          error={error}
        />
      </form>
    </DialogShell>
  )
}
