// Custom designs: a client's own HTML email. Finds and edits its links and
// images in place (string surgery, so the designer's markup is kept as it is),
// strips what email apps would block anyway, and makes the plain-text version.
// Pure, so the editor, the test send and the real send agree; `npm test`.

export const UNSUBSCRIBE_PLACEHOLDER = "{unsubscribe_url}"

const URL_RE = /^(https?:\/\/[^\s<>"]+|mailto:[^\s<>"]+|tel:\+?[\d\s()-]+)$/i
const MAX_URL = 2000

/** "thinktx.my/updates" → "https://thinktx.my/updates": links are often pasted
 * without the scheme. Anything else (mailto:, tel:, a typo) is left for the
 * link check to report. */
export function withScheme(raw: string): string {
  const url = raw.trim()
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#:]|$)/i.test(url)
    ? `https://${url}`
    : url
}

/** What's wrong with a link, or "" when it's fine. "Needs a link" only stops a send. */
export function linkProblem(url: string): string {
  if (url === UNSUBSCRIBE_PLACEHOLDER) return ""
  if (!url || url === "#") return "Needs a link"
  if (url.length > MAX_URL) return "That link is too long."
  if (!URL_RE.test(url)) return "Use a full link starting with https://"
  return ""
}

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  middot: "·",
  bull: "•",
  copy: "©",
  reg: "®",
  trade: "™",
  zwnj: "",
  zwj: "",
}

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n =
        code[1] === "x" || code[1] === "X"
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10)
      return Number.isFinite(n) && n > 0 && n < 0x110000
        ? String.fromCodePoint(n)
        : m
    }
    return NAMED[code.toLowerCase()] ?? m
  })
}

const attrValue = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;")

/** Comments blanked out (same length), so tags inside Outlook-only blocks
 * aren't listed and every index still points into the original. */
function visible(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, (c) => " ".repeat(c.length))
}

interface Attr {
  value: string
  /** Where the raw value sits in the document (without quotes). */
  start: number
  end: number
}

function attr(tag: string, tagStart: number, name: string): Attr | null {
  const m = new RegExp(
    `\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    "i"
  ).exec(tag)
  if (!m) return null
  const raw = m[1] ?? m[2] ?? m[3] ?? ""
  const quoted = m[1] !== undefined || m[2] !== undefined
  const start = tagStart + m.index + m[0].length - raw.length - (quoted ? 1 : 0)
  return { value: decodeEntities(raw).trim(), start, end: start + raw.length }
}

export interface HtmlLink {
  url: string
  /** What the reader sees: the link's text, or its image's alt text. */
  text: string
  start: number
  end: number
}

export function findLinks(html: string): HtmlLink[] {
  const doc = visible(html)
  const out: HtmlLink[] = []
  for (const m of doc.matchAll(/<a\b[^>]*>/gi)) {
    const href = attr(m[0], m.index, "href")
    if (!href) continue
    const after = m.index + m[0].length
    const close = doc.slice(after).search(/<\/a\s*>/i)
    const inner = close >= 0 ? doc.slice(after, after + close) : ""
    let text = decodeEntities(inner.replace(/<[^>]*>/g, " "))
      .replace(/\s+/g, " ")
      .trim()
    if (!text) {
      const alt = /<img\b[^>]*\salt\s*=\s*"([^"]*)"/i.exec(inner)?.[1]
      text = alt ? `Image: ${decodeEntities(alt)}` : "Image"
    }
    out.push({ url: href.value, text, start: href.start, end: href.end })
  }
  return out
}

export function setLinkUrl(html: string, index: number, url: string): string {
  const link = findLinks(html)[index]
  if (!link) return html
  return html.slice(0, link.start) + attrValue(url) + html.slice(link.end)
}

export interface HtmlImage {
  src: string
  alt: string
  start: number
  end: number
}

export function findImages(html: string): HtmlImage[] {
  const doc = visible(html)
  const out: HtmlImage[] = []
  for (const m of doc.matchAll(/<img\b[^>]*>/gi)) {
    const src = attr(m[0], m.index, "src")
    if (!src) continue
    out.push({
      src: src.value,
      alt: attr(m[0], m.index, "alt")?.value ?? "",
      start: src.start,
      end: src.end,
    })
  }
  return out
}

/** Points every image that uses `from` at `to`. */
export function replaceImageSrc(
  html: string,
  from: string,
  to: string
): string {
  let out = html
  for (const img of findImages(html).reverse())
    if (img.src === from)
      out = out.slice(0, img.start) + attrValue(to) + out.slice(img.end)
  return out
}

/** An image that still points at a file on someone's computer ("hero.jpg"). */
export function isLocalSrc(src: string): boolean {
  return !/^(https?:|data:|cid:|\/\/)/i.test(src) && !src.includes("{")
}

/** "images/Hero%20Shot.jpg?v=2" → "hero shot.jpg", to match uploaded files. */
export function fileNameOf(src: string): string {
  const last = src.split(/[?#]/)[0].split(/[\\/]/).pop() ?? ""
  try {
    return decodeURIComponent(last).toLowerCase()
  } catch {
    return last.toLowerCase()
  }
}

/**
 * Removes what email apps block anyway (scripts, frames, forms, inline event
 * handlers, javascript: links) and adds https:// to links pasted without it.
 */
export function cleanHtml(raw: string): string {
  let html = raw
    .replace(/\r\n?/g, "\n")
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
    .replace(
      /<(iframe|object|embed|frameset|frame|applet)\b[\s\S]*?<\/\1\s*>/gi,
      ""
    )
    .replace(
      /<\/?(script|iframe|object|embed|frameset|frame|applet|form)\b[^>]*>/gi,
      ""
    )
  let prev
  do {
    prev = html
    html = html.replace(
      /(<[a-z][^>]*?)\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
      "$1"
    )
  } while (html !== prev)
  html = html.replace(
    /(\s(?:href|src)\s*=\s*["']?)\s*(?:javascript|vbscript):[^"'\s>]*/gi,
    "$1#"
  )
  const links = findLinks(html)
  for (let i = links.length - 1; i >= 0; i--) {
    const fixed = withScheme(links[i].url)
    if (fixed !== links[i].url) html = setLinkUrl(html, i, fixed)
  }
  return html
}

/** The plain-text version: paragraphs kept, links as "text (link)". */
export function htmlToText(html: string): string {
  let s = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(head|style|title)\b[\s\S]*?<\/\1\s*>/gi, "")
    // Hidden preview text isn't part of the message.
    .replace(/<div\b[^>]*display:\s*none[^>]*>[\s\S]*?<\/div>/gi, "")
  s = s.replace(
    /<a\b[^>]*\shref\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>([\s\S]*?)<\/a\s*>/gi,
    (_, d: string, q: string, inner: string) => {
      const url = decodeEntities(d ?? q ?? "").trim()
      const text = inner
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
      // A linked logo or picture: its alt text, without the link.
      if (!text)
        return decodeEntities(
          /<img\b[^>]*\salt\s*=\s*"([^"]*)"/i.exec(inner)?.[1] ?? ""
        )
      if (!url || url === "#" || /^javascript:/i.test(url)) return text
      return decodeEntities(text) !== url ? `${text} (${url})` : url
    }
  )
  s = s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|h[1-6]|tr|table|div|ul|ol|blockquote)\b[^>]*>/gi, "\n\n")
    .replace(/<\/li\s*>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "- ")
    .replace(/<\/t[dh]\s*>/gi, " ")
    .replace(/<[^>]*>/g, "")
  return decodeEntities(s)
    .replace(/[ \t ]+/g, " ")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}
