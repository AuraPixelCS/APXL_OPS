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
  buildRows,
  canSelect,
  countByStatus,
} from "../lib/blasts/recipients.ts"

let passed = 0
const ok = (cond: unknown, msg: string) => {
  assert.ok(cond, msg)
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

console.log(`blasts: ${passed} checks passed`)
