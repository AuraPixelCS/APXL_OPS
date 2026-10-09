"use client"

// "Custom design" in the Email tab: the client's own finished email (HTML).
// Drop the .html together with its images (they're uploaded and linked for
// you), set where every link and button goes, swap images, or edit the HTML.
// The HTML rules live in lib/blasts/html.ts.

import {
  CodeIcon,
  FileCodeIcon,
  ImageIcon,
  ImageOffIcon,
  LinkIcon,
  RefreshCwIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react"
import * as React from "react"
import type { BlastEmailForm } from "@/components/blasts/use-blast-email-form"
import { SectionCard } from "@/components/settings/form-bits"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import {
  FileUpload,
  FileUploadDescription,
  FileUploadDropzone,
  FileUploadDropzoneIcon,
  FileUploadTitle,
  FileUploadTrigger,
} from "@/components/ui/file-upload"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/toast"
import { apiPost } from "@/lib/api"
import { HTML_CLIP_WARNING } from "@/lib/blasts/email"
import {
  cleanHtml,
  fileNameOf,
  findImages,
  findLinks,
  isLocalSrc,
  linkProblem,
  replaceImageSrc,
  setLinkUrl,
  UNSUBSCRIBE_PLACEHOLDER,
  withScheme,
} from "@/lib/blasts/html"
import { prepareBanner } from "@/lib/blasts/image"

const IMAGE_ACCEPT: Record<string, string[]> = {
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
}
const DESIGN_ACCEPT: Record<string, string[]> = {
  "text/html": [".html", ".htm"],
  ...IMAGE_ACCEPT,
}

const isHtmlFile = (f: File) =>
  f.type === "text/html" || /\.html?$/i.test(f.name)

/** Uploads an image for this blast; returns its public link for emails. */
async function uploadImage(blastId: string, file: File): Promise<string> {
  const data = await prepareBanner(file)
  const { url } = await apiPost<{ url: string }>("/api/blasts/banner", {
    blastId,
    data,
  })
  return url
}

export function CustomDesign({
  blastId,
  form,
}: {
  blastId: string
  form: BlastEmailForm
}) {
  const { values: v, set, errors } = form
  const html = v.html
  const [busy, setBusy] = React.useState("")
  const [error, setError] = React.useState<string>()
  const [editing, setEditing] = React.useState(false)
  // Remounting the picker after each drop clears its file list.
  const [round, setRound] = React.useState(0)

  const links = React.useMemo(() => findLinks(html), [html])
  const images = React.useMemo(() => findImages(html), [html])
  const missing = [
    ...new Set(
      images.filter((i) => isLocalSrc(i.src)).map((i) => fileNameOf(i.src))
    ),
  ]

  /** A drop: the design's .html (optional when one is loaded) + images. */
  async function addFiles(files: File[]) {
    setError(undefined)
    const page = files.find(isHtmlFile)
    let next = page ? cleanHtml(await page.text()) : html
    if (!next.trim()) {
      setError("Add the design's .html file (you can drop its images with it).")
      return
    }
    const pictures = new Map(
      files.filter((f) => !isHtmlFile(f)).map((f) => [f.name.toLowerCase(), f])
    )
    const wanted = [
      ...new Set(
        findImages(next)
          .filter((i) => isLocalSrc(i.src))
          .map((i) => i.src)
      ),
    ].filter((src) => pictures.has(fileNameOf(src)))
    let done = 0
    try {
      for (const src of wanted) {
        setBusy(`Uploading images (${done + 1} of ${wanted.length})…`)
        const url = await uploadImage(blastId, pictures.get(fileNameOf(src))!)
        next = replaceImageSrc(next, src, url)
        done++
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "An image didn't upload. Try again."
      )
    } finally {
      setBusy("")
      setRound((r) => r + 1)
    }
    set("html", next)
    const stillMissing = new Set(
      findImages(next)
        .filter((i) => isLocalSrc(i.src))
        .map((i) => fileNameOf(i.src))
    )
    if (!page && done)
      toast.success({
        title: `${done} image${done === 1 ? "" : "s"} uploaded`,
      })
    if (page)
      toast.success({
        title: "Design added",
        description: stillMissing.size
          ? `${done} image${done === 1 ? "" : "s"} uploaded. Still missing: ${[...stillMissing].join(", ")}.`
          : done
            ? `${done} image${done === 1 ? "" : "s"} uploaded.`
            : undefined,
      })
  }

  async function replaceImage(src: string, file: File | undefined) {
    if (!file) return
    setError(undefined)
    setBusy("Uploading the image…")
    try {
      set("html", replaceImageSrc(html, src, await uploadImage(blastId, file)))
    } catch (e) {
      setError(e instanceof Error ? e.message : "The image didn't upload.")
    } finally {
      setBusy("")
    }
  }

  const sizeKb = Math.round(new Blob([html]).size / 1024)

  return (
    <>
      <SectionCard title="Design">
        {!html ? (
          <FileUpload
            key={round}
            maxFiles={40}
            accept={DESIGN_ACCEPT}
            onFileAccept={(d) => void addFiles(d.files)}
            onFileReject={() =>
              setError(
                "Use the design's .html file and PNG, JPG or GIF images."
              )
            }
            disabled={Boolean(busy)}
          >
            <FileUploadDropzone className="min-h-44 rounded-xl border-dashed bg-card/50">
              {busy ? (
                <>
                  <Spinner className="size-6 text-muted-foreground" />
                  <FileUploadDescription>{busy}</FileUploadDescription>
                </>
              ) : (
                <>
                  <FileUploadDropzoneIcon />
                  <FileUploadTitle>
                    Drop the .html file and its images
                  </FileUploadTitle>
                  <FileUploadTrigger asChild>
                    <Button variant="outline" size="xl">
                      <FileCodeIcon />
                      Choose files
                    </Button>
                  </FileUploadTrigger>
                </>
              )}
            </FileUploadDropzone>
          </FileUpload>
        ) : (
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex min-w-0 items-start gap-3 rounded-xl border bg-muted/30 p-4">
              <FileCodeIcon
                className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">Custom design</p>
                <p className="text-muted-foreground">
                  {sizeKb.toLocaleString()} KB · {links.length}{" "}
                  {links.length === 1 ? "link" : "links"} · {images.length}{" "}
                  {images.length === 1 ? "image" : "images"}
                </p>
              </div>
            </div>
            {sizeKb * 1024 > HTML_CLIP_WARNING && (
              <Alert variant="warning">
                <TriangleAlertIcon />
                <AlertDescription>
                  Gmail cuts off emails over 102 KB and hides the rest
                  (including Unsubscribe). Ask for a lighter design.
                </AlertDescription>
              </Alert>
            )}
            <div className="flex flex-wrap gap-2">
              <FileUpload
                key={round}
                maxFiles={40}
                accept={DESIGN_ACCEPT}
                onFileAccept={(d) => void addFiles(d.files)}
                onFileReject={() =>
                  setError(
                    "Use the design's .html file and PNG, JPG or GIF images."
                  )
                }
                disabled={Boolean(busy)}
              >
                <FileUploadTrigger asChild>
                  <Button variant="outline" size="xl" disabled={Boolean(busy)}>
                    {busy ? <Spinner /> : <RefreshCwIcon />}
                    {busy || "Replace design"}
                  </Button>
                </FileUploadTrigger>
              </FileUpload>
              <Button
                variant="outline"
                size="xl"
                aria-expanded={editing}
                onClick={() => setEditing((x) => !x)}
              >
                <CodeIcon />
                {editing ? "Hide HTML" : "Edit HTML"}
              </Button>
              <Button
                variant="ghost"
                size="xl"
                onClick={() => {
                  set("html", "")
                  setEditing(false)
                }}
                disabled={Boolean(busy)}
              >
                <Trash2Icon />
                Remove
              </Button>
            </div>
            {editing && (
              <Field invalid={Boolean(errors.html)}>
                <FieldLabel>HTML</FieldLabel>
                <Textarea
                  rows={16}
                  value={html}
                  spellCheck={false}
                  onChange={(e) => set("html", e.target.value)}
                  className="min-h-72 font-mono text-xs leading-relaxed"
                />
              </Field>
            )}
          </div>
        )}
        {(error || errors.html) && (
          <p className="text-sm text-destructive-foreground">
            {error ?? errors.html}
          </p>
        )}
      </SectionCard>

      {html && (
        <LinksCard
          html={html}
          links={links}
          onChange={(next) => set("html", next)}
        />
      )}

      {html && images.length > 0 && (
        <SectionCard title="Images">
          {missing.length > 0 && (
            <Alert variant="warning">
              <TriangleAlertIcon />
              <AlertDescription>
                Not uploaded yet: {missing.join(", ")}. Drop them here with
                &ldquo;Replace design&rdquo; (the images alone are enough), or
                use Upload next to each one.
              </AlertDescription>
            </Alert>
          )}
          <ul className="flex flex-col divide-y rounded-xl border">
            {[...new Map(images.map((i) => [i.src, i])).values()].map((img) => (
              <ImageRow
                key={img.src}
                src={img.src}
                alt={img.alt}
                busy={Boolean(busy)}
                onFile={(f) => void replaceImage(img.src, f)}
                onFiles={(fs) => void addFiles(fs)}
              />
            ))}
          </ul>
        </SectionCard>
      )}
    </>
  )
}

// ── Links ──────────────────────────────────────────────────────────────────

function LinksCard({
  html,
  links,
  onChange,
}: {
  html: string
  links: ReturnType<typeof findLinks>
  onChange: (html: string) => void
}) {
  const seen = new Map<string, number>()
  return (
    <SectionCard title="Links">
      {links.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          This design has no links.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {links.map((link, i) => {
            const n = (seen.get(link.text) ?? 0) + 1
            seen.set(link.text, n)
            const label = n > 1 ? `${link.text} (${n})` : link.text
            if (link.url === UNSUBSCRIBE_PLACEHOLDER)
              return (
                <div key={i} className="flex min-w-0 items-start gap-3 text-sm">
                  <LinkIcon
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <p className="min-w-0">
                    <span className="font-medium">{label}</span>
                    <span className="text-muted-foreground"> · automatic</span>
                  </p>
                </div>
              )
            const problem = linkProblem(withScheme(link.url))
            return (
              <Field key={i} invalid={Boolean(problem)}>
                <FieldLabel className="line-clamp-2 break-words">
                  {label}
                </FieldLabel>
                <Input
                  type="url"
                  inputMode="url"
                  size="lg"
                  className="h-10"
                  value={link.url === "#" ? "" : link.url}
                  placeholder="https://"
                  onChange={(e) =>
                    onChange(setLinkUrl(html, i, e.target.value))
                  }
                />
                <FieldError>
                  {problem === "Needs a link"
                    ? "Needs a link before you can send."
                    : problem}
                </FieldError>
              </Field>
            )
          })}
        </div>
      )}
    </SectionCard>
  )
}

// ── Images ─────────────────────────────────────────────────────────────────

function ImageRow({
  src,
  alt,
  busy,
  onFile,
  onFiles,
}: {
  src: string
  alt: string
  busy: boolean
  onFile: (f: File | undefined) => void
  onFiles: (fs: File[]) => void
}) {
  const local = isLocalSrc(src)
  return (
    <li className="flex min-w-0 items-center gap-3 p-3">
      <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
        {local ? (
          <ImageOffIcon className="size-5 text-muted-foreground" aria-hidden />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- the design's own image
          <img src={src} alt="" className="size-full object-contain" />
        )}
      </div>
      <div className="min-w-0 flex-1 text-sm">
        <p className="truncate font-medium">
          {alt || fileNameOf(src) || "Image"}
        </p>
        <p
          className={
            local
              ? "truncate text-destructive-foreground"
              : "truncate text-muted-foreground"
          }
        >
          {local ? `Not uploaded: ${fileNameOf(src)}` : "Uploaded"}
        </p>
      </div>
      <FileUpload
        maxFiles={local ? 40 : 1}
        accept={IMAGE_ACCEPT}
        onFileAccept={(d) =>
          local && d.files.length > 1 ? onFiles(d.files) : onFile(d.files[0])
        }
        disabled={busy}
      >
        <FileUploadTrigger asChild>
          <Button
            variant="outline"
            size="lg"
            className="min-h-10"
            disabled={busy}
          >
            <ImageIcon />
            {local ? "Upload" : "Replace"}
          </Button>
        </FileUploadTrigger>
      </FileUpload>
    </li>
  )
}
