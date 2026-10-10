// Tests lib/blasts (email rules, rendering, recipient rows). Plain Node.
import assert from "node:assert/strict"
import {
  bodyToHtml,
  defaultBlastEmail,
  emailDocId,
  renderBlastEmail,
  textOn,
  validateBlastEmail,
} from "../lib/blasts/email.ts"
import {
  cleanHtml,
  findImages,
  findLinks,
  htmlToText,
  replaceImageSrc,
  setLinkUrl,
} from "../lib/blasts/html.ts"
import { randomBytes } from "node:crypto"
import {
  canSendFrom,
  clientForSender,
  NO_RESEND,
  validateClient,
} from "../lib/clients.ts"
import { openSecret, sealSecret, secretsReady } from "../lib/secrets.ts"
import {
  buildRows,
  canSelect,
  countByStatus,
} from "../lib/blasts/recipients.ts"
import {
  buildReport,
  deliveryOf,
  parseReportTo,
  parseResendTime,
  percent,
  renderReport,
  renderReportPdf,
  reportCsv,
} from "../lib/blasts/report.ts"

let passed = 0
const ok = (cond: unknown, msg: string, detail?: unknown) => {
  assert.ok(cond, detail === undefined ? msg : `${msg}: ${String(detail)}`)
  passed++
}

const base = {
  ...defaultBlastEmail({
    senderName: "AuraPixel",
    address: "hello@aurapixel.live",
    signature: "AuraPixel, KL",
  }),
  subject: "Hi {name}, March workshop",
  body: "Hi {name},\n\nSeats are **limited**. See [the agenda](https://aurapixel.live/a?x=1&y=2).\n\n- Day one\n- Day two\n\nhttps://wa.me/60102841290",
}

// Validation
let v = validateBlastEmail(
  { ...base, subject: "", body: "Hi {name},\n\n" },
  { sending: true }
)
ok(
  !v.ok && v.errors.subject && v.errors.body,
  "sending needs a subject and a message"
)
ok(validateBlastEmail({ ...base, subject: "" }).ok, "a draft may be unfinished")
v = validateBlastEmail({ ...base, buttonLabel: "Go" })
ok(!v.ok && v.errors.buttonUrl, "a button needs a link")
v = validateBlastEmail({
  ...base,
  buttonUrl: "javascript:alert(1)",
  buttonLabel: "x",
})
ok(!v.ok && v.errors.buttonUrl, "javascript: links are refused")
v = validateBlastEmail({ ...base, fromEmail: "not an email" })
ok(!v.ok && v.errors.fromEmail, "sender must be an address")
v = validateBlastEmail({ ...base, buttonColor: "blue" })
ok(!v.ok && v.errors.buttonColor, "colour must be #rrggbb")
v = validateBlastEmail({ ...base, fromName: 'Evil" <x@y.z>' })
ok(!v.ok && v.errors.fromName, "sender name can't smuggle an address")

// Rendering
const r = renderBlastEmail(base, {
  name: "Aisyah",
  bannerSrc: "https://x/b.jpg",
  unsubscribeUrl: "https://u/x?b=1&e=2",
})
ok(r.subject === "Hi Aisyah, March workshop", "subject personalised")
ok(r.html.includes("Hi Aisyah,"), "body personalised")
ok(r.html.includes("<strong>limited</strong>"), "bold")
ok(
  r.html.includes('<a href="https://aurapixel.live/a?x=1&amp;y=2"'),
  "markdown link, escaped"
)
ok(/<ul[^>]*><li[^>]*>Day one<\/li>/.test(r.html), "bullet list")
ok(
  r.html.includes('href="https://wa.me/60102841290"'),
  "bare link becomes a link"
)
ok(
  r.html.includes('href="https://u/x?b=1&amp;e=2"') &&
    r.text.includes("Unsubscribe: https://u/x?b=1&e=2"),
  "unsubscribe in HTML and text"
)
ok(r.html.includes('src="https://x/b.jpg"'), "banner")
ok(
  !r.html.includes("{name}") && !r.text.includes("{name}"),
  "no placeholder left"
)

const evil = renderBlastEmail(
  {
    ...base,
    body: "Hi {name}, <script>alert(1)</script> [x](javascript:alert(1))",
  },
  {
    name: "[click](https://phish.example) <b>",
    bannerSrc: "",
    unsubscribeUrl: "#",
  }
)
ok(!evil.html.includes("<script>"), "HTML in the body is escaped")
ok(
  !evil.html.includes('href="javascript:'),
  "javascript: markdown links stay text"
)
ok(
  !evil.html.includes('href="https://phish.example"'),
  "a name written as a link stays text"
)
ok(evil.html.includes("&lt;b&gt;"), "a name with HTML is escaped")
ok(
  renderBlastEmail(base, { name: "", bannerSrc: "", unsubscribeUrl: "#" })
    .subject === "Hi there, March workshop",
  "no name → there"
)
ok(
  !renderBlastEmail(base, {
    name: "A",
    bannerSrc: "",
    unsubscribeUrl: "#",
  }).html.includes("<img"),
  "no banner → no image"
)
ok(
  textOn("#0272e2") === "#ffffff" && textOn("#ffd400") === "#111827",
  "button text colour reads on the button"
)
ok(
  bodyToHtml("a\nb") === '<p style="margin:0 0 16px;">a<br>b</p>',
  "single newlines are line breaks"
)
ok(
  emailDocId(" A/B@x.co ") === "a%2Fb@x.co",
  "doc ids are lowercase and slash-safe"
)

// Recipient rows
const lead = (
  id: string,
  email: string,
  sheetIds: string[],
  extra: Record<string, unknown> = {}
) =>
  ({
    id,
    email,
    emailOk: Boolean(email),
    name: id,
    greetingName: id,
    sheetIds,
    client: "C",
    createdAt: new Date(2026, 0, Number(id.slice(1)) || 1),
    ...extra,
  }) as never
const leads = [
  lead("l1", "a@x.co", ["s1"]),
  lead("l2", "a@x.co", ["s2"]), // same person, other client's lead
  lead("l3", "b@x.co", ["s1"]),
  lead("l4", "c@x.co", ["s1"]),
  lead("l5", "d@x.co", ["s2"]),
  lead("l6", "", ["s1"]),
]
const now = Date.now()
const recs = new Map([
  [
    "b@x.co",
    {
      email: "b@x.co",
      leadId: "l3",
      name: "",
      status: "sent",
      error: null,
      sentAt: new Date(),
      sentBy: null,
      attemptAt: new Date(),
      unsubscribedAt: null,
    },
  ],
  [
    "c@x.co",
    {
      email: "c@x.co",
      leadId: "l4",
      name: "",
      status: "sending",
      error: null,
      sentAt: null,
      sentBy: null,
      attemptAt: new Date(now - 11 * 60_000),
      unsubscribedAt: null,
    },
  ],
  [
    "old@x.co",
    {
      email: "old@x.co",
      leadId: "l9",
      name: "Old",
      status: "sent",
      error: null,
      sentAt: new Date(),
      sentBy: null,
      attemptAt: null,
      unsubscribedAt: null,
    },
  ],
] as const)
const rows = buildRows(leads, new Map(recs as never), new Set(["d@x.co"]), now)
const by = (k: string) => rows.find((x) => x.key === k)!
ok(rows.filter((x) => x.email === "a@x.co").length === 1, "one row per address")
ok(
  by("a@x.co").sheetIds.includes("s1") && by("a@x.co").sheetIds.includes("s2"),
  "row knows every sheet the address is in"
)
ok(
  by("b@x.co").status === "sent" && !canSelect(by("b@x.co")),
  "sent can't be picked again"
)
ok(
  by("c@x.co").status === "not_sent" && canSelect(by("c@x.co")),
  "an abandoned send shows as not sent"
)
ok(
  by("d@x.co").status === "unsubscribed" && !canSelect(by("d@x.co")),
  "unsubscribed can't be picked"
)
ok(by("l6").status === "cant_email", "no address → can't email")
ok(
  by("old@x.co").outside && !canSelect(by("old@x.co")),
  "sent earlier from a removed sheet stays in the history"
)
const c = countByStatus(rows)
ok(
  c.sent === 2 &&
    c.not_sent === 2 &&
    c.unsubscribed === 1 &&
    c.cant_email === 1,
  "counts"
)

// Button and banner links: redirecting/tracking links with query strings work,
// and links pasted without https:// get it.
const redirect = "https://bit.ly/tx-budget27?utm_source=ops&utm_medium=email"
v = validateBlastEmail({
  ...base,
  buttonLabel: "Read the update",
  buttonUrl: redirect,
  bannerLink: "thinktx.my/learning-hub",
})
ok(v.ok, "a redirect link with a query string is accepted")
if (v.ok) {
  ok(v.email.buttonUrl === redirect, "the button link is kept exactly")
  ok(
    v.email.bannerLink === "https://thinktx.my/learning-hub",
    "a link pasted without https:// gets it"
  )
  const out = renderBlastEmail(v.email, {
    name: "Aina",
    bannerSrc: "https://www.aurapixel.live/ops/api/blasts/banner/abcdefghij",
    unsubscribeUrl: "https://www.aurapixel.live/ops/unsubscribe?x",
  })
  ok(
    out.html.includes(
      'href="https://bit.ly/tx-budget27?utm_source=ops&amp;utm_medium=email"'
    ) && out.html.includes(">Read the update</a>"),
    "the button renders as a link to the redirect (& escaped for HTML)"
  )
  ok(
    out.html.includes('<a href="https://thinktx.my/learning-hub"><img'),
    "the banner links where it should"
  )
  ok(
    out.text.includes(`Read the update: ${redirect}`),
    "the plain-text version carries the button link"
  )
}
for (const bad of ["info@thinktx.my", "javascript:alert(1)", "thinktx"])
  ok(
    !validateBlastEmail({ ...base, buttonLabel: "Go", buttonUrl: bad }).ok,
    `rejects "${bad}" as a button link`
  )

// Custom designs (a client's own HTML)
const design = `<!doctype html><html><head><title>x</title></head><body>
<!--[if mso]><a href="https://outlook-only.example">Outlook</a><![endif]-->
<img src="images/Hero%20Shot.jpg" alt="Skyline"><img src="https://cdn.x.co/logo.png" alt="Logo">
<p>Dear {name},</p>
<a href="#" style="background:#EE1D46">READ THE <b>BUDGET</b> 2027 HIGHLIGHTS</a>
<a href='thinktx.my'>thinktx.my</a>
<a href="https://x.co/?a=1&amp;b=2"><img src="logo.png" alt="ThinkTx"></a>
<a href="{unsubscribe_url}">Unsubscribe</a>
<script>alert(1)</script><a href="javascript:alert(2)" onclick="steal()">bad</a>
</body></html>`
const cleaned = cleanHtml(design)
ok(
  !/<script|onclick|javascript:/i.test(cleaned),
  "scripts, event handlers and javascript: links are removed"
)
const links = findLinks(cleaned)
ok(
  links.length === 5 && !links.some((l) => l.url.includes("outlook-only")),
  "links inside Outlook-only comments aren't listed"
)
ok(
  links[0].text === "READ THE BUDGET 2027 HIGHLIGHTS" && links[0].url === "#",
  "a button's text is read through inner tags"
)
ok(links[1].url === "https://thinktx.my", "links without https:// get it")
ok(
  links[2].url === "https://x.co/?a=1&b=2" &&
    links[2].text === "Image: ThinkTx",
  "&amp; in links is decoded; image links are named by their alt text"
)
const relinked = setLinkUrl(
  cleaned,
  0,
  "https://bit.ly/tx27?utm_source=ops&utm_medium=email"
)
ok(
  relinked.includes(
    'href="https://bit.ly/tx27?utm_source=ops&amp;utm_medium=email" style="background:#EE1D46"'
  ) &&
    relinked.replace(
      'href="https://bit.ly/tx27?utm_source=ops&amp;utm_medium=email"',
      'href="#"'
    ) === cleaned,
  "editing a link changes only that href"
)
ok(
  findImages(cleaned)
    .map((i) => i.src)
    .join("|") === "images/Hero%20Shot.jpg|https://cdn.x.co/logo.png|logo.png",
  "images are found in order"
)
ok(
  replaceImageSrc(cleaned, "logo.png", "https://h.co/a?x=1&y=2").includes(
    'src="https://h.co/a?x=1&amp;y=2" alt="ThinkTx"'
  ),
  "an image's src can be replaced"
)
const cBase = {
  ...base,
  design: "custom" as const,
  // the cleaned-out javascript: link (now "#") gets a real address
  html: setLinkUrl(relinked, 4, "https://thinktx.my/contact"),
  preheader: "Budget 2027 highlights",
}
v = validateBlastEmail(cBase, { sending: true })
ok(
  !v.ok &&
    /missing images: hero shot\.jpg, logo\.png/.test(v.errors.html ?? ""),
  "sending needs the design's images uploaded",
  v.ok ? "" : v.errors.html
)
v = validateBlastEmail(
  {
    ...cBase,
    html: replaceImageSrc(
      replaceImageSrc(cBase.html, "images/Hero%20Shot.jpg", "https://h.co/1"),
      "logo.png",
      "https://h.co/2"
    ),
  },
  { sending: true }
)
ok(
  v.ok,
  "a finished custom design can be sent",
  v.ok ? "" : JSON.stringify(v.errors)
)
ok(
  validateBlastEmail({ ...cBase, html: cleaned }).ok &&
    !validateBlastEmail({ ...cBase, html: cleaned }, { sending: true }).ok,
  "an empty button link can be saved as a draft but not sent"
)
ok(
  !validateBlastEmail({ ...cBase, html: '<a href="not a link">x</a>' }).ok,
  "a broken link stops even a draft save"
)
ok(
  validateBlastEmail(
    { ...cBase, design: "standard", body: "Hi {name},\n\n" },
    { sending: false }
  ).ok &&
    validateBlastEmail({ ...cBase, body: "" }, { sending: true }).ok === false,
  "the standard layout ignores the design and vice versa"
)
if (v.ok) {
  const r = renderBlastEmail(v.email, {
    name: "<b>Aina</b>",
    bannerSrc: "",
    unsubscribeUrl: "https://www.aurapixel.live/ops/unsubscribe?b=1&e=a&t=z",
  })
  ok(
    r.html.includes("Dear &lt;b&gt;Aina&lt;/b&gt;,"),
    "{name} is escaped in a custom design"
  )
  ok(
    r.html.includes(
      'href="https://www.aurapixel.live/ops/unsubscribe?b=1&amp;e=a&amp;t=z">Unsubscribe'
    ) && (r.html.match(/Unsubscribe<\/a>/g) ?? []).length === 1,
    "the design's own Unsubscribe link is filled in (no second one added)"
  )
  ok(
    /<body>\n<div style="display:none[^>]*>Budget 2027 highlights/.test(r.html),
    "preview text goes right after <body>"
  )
  ok(
    r.text.includes(
      "READ THE BUDGET 2027 HIGHLIGHTS (https://bit.ly/tx27?utm_source=ops&utm_medium=email)"
    ) &&
      r.text.includes("Dear <b>Aina</b>,") &&
      !r.text.includes("display:none") &&
      !r.text.includes("Budget 2027 highlights\n"),
    "the plain-text version has the text and the button link",
    r.text
  )
  const noUnsub = renderBlastEmail(
    { ...v.email, html: "<p>Hello {name}</p>" },
    { name: "", bannerSrc: "", unsubscribeUrl: "https://u.co/x" }
  )
  ok(
    noUnsub.html.startsWith("<!doctype html>") &&
      noUnsub.html.includes("Hello there") &&
      noUnsub.html.includes('<a href="https://u.co/x"') &&
      noUnsub.text.includes("Unsubscribe (https://u.co/x)"),
    "a fragment gets a full page and an Unsubscribe line"
  )
}
ok(
  htmlToText(
    "<p>A&amp;B&nbsp;&rsquo;s</p><ul><li>One</li><li>Two</li></ul>"
  ) === "A&B ’s\n\n- One\n- Two",
  "entities and lists in the text version"
)
ok(
  htmlToText(
    '<a href="https://thinktx.my"><img src="l.png" alt="ThinkTx"></a><p>Hi</p>'
  ) === "ThinkTx\n\nHi",
  "a linked logo becomes its alt text in the text version"
)

// Clients: sealed Resend keys, details, which domains an account can send from
delete process.env.OPS_SECRETS_KEY
ok(!secretsReady(), "no OPS_SECRETS_KEY: keys can't be stored")
process.env.OPS_SECRETS_KEY = randomBytes(32).toString("base64")
const sealedKey = sealSecret("re_test_1234567890")
ok(
  secretsReady() &&
    sealedKey.startsWith("v1:") &&
    !sealedKey.includes("re_test") &&
    openSecret(sealedKey) === "re_test_1234567890",
  "a key is sealed (not readable as text) and opens again"
)
ok(
  sealSecret("same") !== sealSecret("same"),
  "sealing twice never looks the same"
)
const [v1, iv, tag, data] = sealedKey.split(":")
const flipped = Buffer.from(data, "base64")
flipped[0] ^= 1
ok(
  openSecret([v1, iv, tag, flipped.toString("base64")].join(":")) === null,
  "a tampered key won't open"
)
process.env.OPS_SECRETS_KEY = randomBytes(32).toString("base64")
ok(openSecret(sealedKey) === null, "a different OPS_SECRETS_KEY can't open it")
const cv = validateClient({
  name: "  ThinkTx  ",
  fromName: "ThinkTx",
  fromEmail: "INFO@thinktx.my ",
  replyTo: "",
  footer: "Suite B-16-3\r\nKuala Lumpur",
})
ok(
  cv.ok &&
    cv.client.name === "ThinkTx" &&
    cv.client.fromEmail === "info@thinktx.my" &&
    cv.client.footer === "Suite B-16-3\nKuala Lumpur",
  "client details are tidied"
)
const bad = validateClient({ name: "", fromName: 'A "B"', fromEmail: "nope" })
ok(
  !bad.ok && bad.errors.name && bad.errors.fromName && bad.errors.fromEmail,
  "client needs a name, a clean sender name and a real address"
)
const tx = { ...NO_RESEND, connected: true, domains: ["thinktx.my"] }
ok(
  canSendFrom(tx, "info@thinktx.my") &&
    !canSendFrom(tx, "news@mail.thinktx.my") &&
    !canSendFrom(tx, "hello@aurapixel.live"),
  "an account sends only from its exact verified domains"
)
ok(
  canSendFrom({ ...tx, restricted: true, domains: [] }, "x@anything.co"),
  "a sending-only key (domains unknown) isn't second-guessed"
)
const people = [
  { id: "thinktx", resend: tx },
  { id: "noKey", resend: { ...NO_RESEND, domains: ["other.co"] } },
]
ok(
  clientForSender(people, "info@thinktx.my") === "thinktx" &&
    clientForSender(people, "hello@aurapixel.live") === "" &&
    clientForSender(people, "x@other.co") === "",
  "an untagged sender goes with the client whose Resend owns its domain"
)
ok(
  validateBlastEmail({ ...base, clientId: "Ab12Cd34Ef56Gh78" }).ok &&
    !validateBlastEmail({ ...base, clientId: "../secrets" }).ok,
  "a blast's client tag must be a plain id"
)

// ── Client report ──────────────────────────────────────────────────────────
ok(
  parseResendTime("2026-10-09 15:46:56.073000+00")?.toISOString() ===
    "2026-10-09T15:46:56.073Z" &&
    parseResendTime("2026-10-09T15:46:56Z")?.toISOString() ===
      "2026-10-09T15:46:56.000Z" &&
    parseResendTime("yesterday") === null,
  "Resend's timestamps parse, microseconds and all"
)
ok(
  deliveryOf("clicked") === "clicked" &&
    deliveryOf("suppressed") === "bounced" &&
    deliveryOf("delivery_delayed") === "pending" &&
    deliveryOf(undefined) === "unknown",
  "Resend's last event maps to what happened to the email"
)
const at = (iso: string) => new Date(iso)
const reportInput = {
  blastName: "ThinkTx EDM",
  campaign: "Budget 2027 & you",
  client: "ThinkTx",
  fromName: "ThinkTx",
  fromEmail: "info@thinktx.my",
  audience: ["a", "b", "c", "d", "e", "f", "g"].map((x) => ({
    email: `${x}@x.co`,
    name: x === "a" ? "=HYPERLINK(1)" : "",
  })),
  recipients: [
    // 15:00 UTC is 11pm on 8 Oct in Malaysia; 16:30 UTC (still 8 Oct in UTC) is 12:30am on 9 Oct.
    {
      email: "a@x.co",
      status: "sent",
      sentAt: at("2026-10-08T15:00:00Z"),
      resendId: "r1",
    },
    {
      email: "b@x.co",
      status: "sent",
      sentAt: at("2026-10-08T15:00:01Z"),
      resendId: "r2",
    },
    {
      email: "c@x.co",
      status: "sent",
      sentAt: at("2026-10-08T16:30:00Z"),
      resendId: "r3",
    },
    {
      email: "d@x.co",
      status: "sent",
      sentAt: at("2026-10-08T16:30:01Z"),
      resendId: "r4",
      unsubscribedAt: at("2026-10-09T02:00:00Z"),
    },
    { email: "e@x.co", status: "failed", sentAt: null, resendId: null },
    // Emailed, then their file was taken out of the blast.
    {
      email: "gone@x.co",
      status: "sent",
      sentAt: at("2026-10-08T16:30:02Z"),
      resendId: "r5",
    },
  ].map((r) => ({ name: "", unsubscribedAt: null, ...r })) as Parameters<
    typeof buildReport
  >[0]["recipients"],
  unsubscribed: new Set(["d@x.co", "f@x.co"]),
  events: new Map([
    ["r1", "clicked"],
    ["r2", "opened"],
    ["r3", "bounced"],
    ["r4", "delivered"],
  ]),
  tracking: { opens: true, clicks: true },
  now: at("2026-10-10T04:00:00Z"),
}
const { report: rep, rows: repRows } = buildReport(reportInput)
ok(
  rep.people === 8 && rep.sent === 5 && rep.toSend === 2 && rep.skipped === 1,
  "the list adds up: emailed + still to send + opted out earlier",
  JSON.stringify(rep)
)
ok(
  rep.unsubscribed === 1 &&
    rep.delivery?.checked === 4 &&
    rep.delivery.delivered === 3 &&
    rep.delivery.opened === 2 &&
    rep.delivery.clicked === 1 &&
    rep.delivery.bounced === 1,
  "delivered counts opened and clicked; an email Resend didn't report isn't counted",
  JSON.stringify(rep.delivery)
)
ok(
  rep.rounds.length === 2 &&
    rep.rounds[0].sent === 2 &&
    rep.rounds[1].sent === 3 &&
    /8 Oct/.test(rep.rounds[0].day) &&
    /9 Oct/.test(rep.rounds[1].day),
  "send rounds are Malaysia-time days",
  JSON.stringify(rep.rounds)
)
ok(
  percent(3, 4) === "75%" && percent(1, 3) === "33.3%" && percent(1, 0) === "",
  "percentages round to one place, and skip dividing by nothing"
)
const out = renderReport(rep, {
  note: "Hi team,\n\nHere's <your> report.",
  logoSrc: "https://www.aurapixel.live/ops/report-logo.png",
  signature: "The AuraPixel team",
})
ok(
  out.subject === "Email campaign report: Budget 2027 & you" &&
    out.html.includes("Budget 2027 &amp; you") &&
    out.html.includes("Prepared for ThinkTx") &&
    out.html.includes("Here&#39;s &lt;your&gt; report.") &&
    out.html.includes('alt="AuraPixel"') &&
    out.html.includes(">Opened<") &&
    out.html.includes(">Clicked<") &&
    !out.html.includes("<your>"),
  "the report escapes the note and names, and is AuraPixel-branded"
)
ok(
  out.text.includes("Emails sent: 5") &&
    out.text.includes("Delivered: 3 (75%)") &&
    out.text.includes("Prepared by AuraPixel"),
  "the report has a plain-text version",
  out.text
)
const untracked = renderReport(
  buildReport({
    ...reportInput,
    events: new Map([["r4", "delivered"]]),
    tracking: { opens: false, clicks: false },
  }).report,
  { note: "", logoSrc: "x", signature: "" }
)
ok(
  !untracked.html.includes(">Opened<") &&
    !untracked.html.includes(">Clicked<") &&
    untracked.html.includes(">Delivered<"),
  "opens and clicks are left out when the domain doesn't track them"
)
const blind = buildReport({ ...reportInput, events: null }).report
ok(
  blind.delivery === null &&
    renderReport(blind, {
      note: "",
      logoSrc: "x",
      signature: "",
    }).html.includes(">Still to send<"),
  "without Resend's side, the report shows only what Ops knows"
)
const pdf = renderReportPdf(rep, {
  note: "Hi <team>",
  logoSrc: "https://www.aurapixel.live/ops/report-logo.png",
  signature: "The AuraPixel team",
})
ok(
  pdf.includes("@page { size: A4; margin: 0; }") &&
    pdf.includes("repeat(3, 1fr)") &&
    pdf.includes(
      "<title>ThinkTx - Email campaign report - Budget 2027 &amp; you</title>"
    ) &&
    pdf.includes("Hi &lt;team&gt;") &&
    !pdf.includes("<team>"),
  "Save as PDF is a full A4 page (no browser header/footer), escaped, 3 tiles a row for 6"
)
ok(
  renderReportPdf(blind, { note: "", logoSrc: "x", signature: "" }).includes(
    "repeat(4, 1fr)"
  ),
  "four tiles sit in one row on the page"
)
const csv = reportCsv(repRows)
ok(
  csv.startsWith("Email,Name,Status,Sent (Malaysia time)\r\n") &&
    csv.includes("a@x.co,'=HYPERLINK(1),Clicked,") &&
    csv.includes("d@x.co,,Unsubscribed,") &&
    csv.includes("e@x.co,,Not sent yet,") &&
    csv.includes("f@x.co,,Opted out earlier,") &&
    csv.includes("c@x.co,,Bounced,"),
  "the CSV lists everyone with what happened, and can't run formulas",
  csv
)
const toOk = parseReportTo("Boss@Client.com, ops@client.com;boss@client.com")
const toBad = parseReportTo("boss@client.com, nope")
ok(
  toOk.ok &&
    toOk.to.join() === "boss@client.com,ops@client.com" &&
    !toBad.ok &&
    !parseReportTo(" ").ok,
  "report addresses are split, tidied and checked"
)

console.log(`blasts: ${passed} checks passed`)
