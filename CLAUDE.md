@AGENTS.md

# AuraPixel Ops (ap-ops)

AuraPixel's internal operations panel, served at aurapixel.live/ops. First job:
the lead pipeline. Leads come in (CSV import now, Meta via n8n later), get
emailed, an AI assistant drafts replies that Mandy approves, and everything is
reported here. The n8n side lives in `../pxl-auto`. Read the Second Brain note
`Projects/AuraPixel/ap-ops.md` first.

## Stack (chosen by Mandy, follow it exactly)

- Next.js 16.4 App Router, TypeScript, Tailwind v4, Firebase (Auth + Firestore).
- **UI = Shark UI** (shadcn-style components on Ark UI, registry
  `@shark` → `https://shark-ui.com/r/{name}.json`; the old `shark.vini.one` URL
  308-redirects). Add components with `npx shadcn@latest add @shark/<name>`.
  Ark callbacks pass detail objects: `onValueChange={(d) => d.value}`,
  `onOpenChange={(d) => d.open}`, `onFileAccept={(d) => d.files}`.
  `components/ui/**` and `hooks/use-is-mobile.tsx` are vendored: don't restyle
  them; they're excluded from lint. Some Shark parts ship bare (SegmentGroup):
  style them once in a wrapper (`components/common/filter-tabs.tsx`).
- **Icons: lucide-react only.** No emoji as icons.
- **Dark only, AuraPixel blue.** Tokens in `app/globals.css` (`:root`, and
  `<html class="dark">` is always on). Brand `#0272e2` / bright `#0094ff` / deep
  `#0b49c4`, shared with every AuraPixel project; surfaces match PXL Booth's dark
  mode. Use tokens (`bg-primary`, `text-muted-foreground`), never raw hex. Small
  blue text uses `text-brand-bright` or `text-info`: plain `#0272e2` on the dark
  background is under 4.5:1. `shadcn add` may append a `.dark {}` block to
  globals.css that overrides our status colours: delete it.
- **Layout:** edge-to-edge, `page-x` utility for gutters, no centred max-width
  page containers. Mobile-first, touch targets ≥ 40–44px (buttons `size="lg"/"xl"`).
  On touch screens (`@media (pointer: coarse)` in globals.css) menu items, select items,
  sidebar links, dialog close and the password eye get 44px; Shark buttons already add a
  44px invisible hit area there. Inputs are 16px on phones (no iOS zoom). Sticky bottom
  bars (SaveBar only while dirty, the blast send bar) sit at the end of the content;
  toasts are top-end so they never cover them. Lists are cards under `md`, tables above.
  Mobile check: `pw-mobile-audit` style run at 360 and 390px (note: Playwright full-page
  screenshots drop touch emulation, so measure before screenshotting).
- Code style: Prettier config from PXL Booth (no semicolons, double quotes).

## Next 16.4 specifics (Cache Components + Partial Prefetching are on)

- Read `node_modules/next/dist/docs/` before using an API you haven't checked.
- `useParams` / `usePathname` / `useSearchParams` suspend on routes with
  request-time params: wrap in `<Suspense>` (see `app/(app)/layout.tsx`,
  `app/(app)/leads/[id]/page.tsx`, `app/login/page.tsx`).
- Every page under `app/(app)/` must `export const instant = false`. The auth gate
  only resolves in the browser, so the page never renders during prerendering
  and dev logs a "dropped segment" error otherwise. A layout-level `instant`
  does NOT silence it; it has to be on the page.
- Client component state survives navigation (React `<Activity>`); reset local
  state in handlers when leaving a flow (see `Done` in the import page).

## Data and security

- Browser READS Firestore directly (live `onSnapshot` in `hooks/use-leads.ts`);
  `firestore.rules` allows reads to the `admin` custom claim only and denies all
  browser writes. Every WRITE goes through an API route using the Admin SDK
  (`lib/firebase/admin.ts`) behind `verifyAdmin()`.
- `lib/leads/clean.ts` is the single lead-cleaning implementation, shared by the
  import preview (browser) and `POST /api/leads/import` (server re-cleans raw
  rows). Tests: `npm test` (`scripts/test-clean.ts`, plain Node type stripping;
  `allowImportingTsExtensions` is on for that).
- **Sheets** (`/sheets`, `imports/{id}`): every import is a sheet with a `title` and a
  `client` (+ `clientKey` = lowercased, spaces collapsed; the first spelling wins). Leads
  carry `client`, `clientKey` and `sheetIds[]`. Lead IDs are sha256 of
  `<clientKey>|email:<addr>` (else `|phone:<digits>`): duplicates are matched **per
  client**, so the same person for two clients is two leads, and a re-import for the same
  client adds the sheet to `sheetIds` without overwriting anything. The sheet doc is
  written before its leads, so deleting a half-imported sheet cleans up.
  `POST /api/sheets/delete` deletes leads only in that sheet and `arrayRemove`s it from
  the rest; `/api/sheets/update` renames only (client is fixed: delete + re-import).
- **File formats** (`lib/leads/file.ts`, browser): CSV/TSV/TXT through Papa Parse (UTF-16
  Meta exports sniffed by BOM); XLSX/XLSM/XLS/ODS/Numbers/Excel-XML through SheetJS,
  lazy-loaded. SheetJS comes from `cdn.sheetjs.com` (0.20.3) because the npm `xlsx` is
  stale and vulnerable. Formats are detected by magic bytes, not extension. Everything
  becomes a grid → `lib/leads/grid.ts` (header row = first of the top 10 rows naming a
  name/email/phone column; numeric cells keep every digit). `cleanLead` turns a 9–10
  digit number starting with 1 (Excel dropped the 0) into `60…`.
- Leads list scoping (`useLeads({clientKey | sheetId})`) uses single-field `where`
  filters with no `orderBy`, so no composite indexes; sorted in the browser. Unscoped it's
  the newest 1000. Filters live in the URL (`/leads?client=…` / `?sheet=…`).
- **Email blasts** (`/blasts`, `blasts/{id}`): a blast = name + up to 30 sheets
  (`array-contains-any` limit) + its own email (`lib/blasts/email.ts`: fields, validation,
  renderer). The SAME `renderBlastEmail` drives the editor's iframe preview, the test send
  and the real send. Body is plain text with light formatting (**bold**, [text](url), "- "
  lists, bare links); `{name}` is inserted AFTER formatting and escaped, so a lead whose
  "name" is markdown/HTML can't inject links. Send tracking:
  `blasts/{id}/recipients/{email}` (doc id = lowercased address, `emailDocId`), one per
  ADDRESS (the same person can be a lead for two clients). `POST /api/blasts/send` only
  sends to addresses in the blast's sheets, claims each as `sending` first, skips sent /
  fresh `sending` (<10 min) / unsubscribed, sends Resend batches of 100 with an
  Idempotency-Key, then marks sent/failed. Account-level refusals (401/403/429/503: daily
  quota, bad key, unverified domain) RESTORE the claims so people stay "Not sent" instead
  of "Failed". Max 500 per request; the UI loops for bigger selections.
- **Uploaded files for one blast** (`blastLists/{id}` + `contacts/{email}`): "Upload a
  file" in New blast / "Who it goes to" reads CSV/Excel with the Sheets reader, then
  `saveBlastList` cleans rows with `cleanLead` and stores one contact per address. They
  NEVER go into `leads` or `imports`, so Leads and Sheets stay real leads only. A blast has
  `sheetIds` and `listIds` (≤10); either may be empty but not both (the server refuses to
  remove the last file when there are no sheets). `loadAudience` and the browser
  (`useListContacts`, shaped as `AudienceLead` with `sheetIds: [listId]`) merge both, one
  row per address. Deleting a blast deletes its files.
- **Clients' own Resend accounts** (Settings → Clients, Mandy 2026-10-09): a client
  (`clients/{id}`: name, sender name/email, reply-to, small print, `resend` status =
  connected / last4 / verified domains / restricted) can send blasts through ITS OWN
  Resend account. A blast is tagged with `email.clientId` ("Sends with" in New blast and
  the Email tab; picking one swaps in that sender's details; "" = AuraPixel's
  RESEND_API_KEY). The client's key is checked with Resend (`GET /domains`; a sending-only
  key reports `restricted_api_key`, so domains are unknown and not checked), then SEALED
  (AES-256-GCM, `lib/secrets.ts`, key = `OPS_SECRETS_KEY` from `npm run setup:secrets`,
  never change it once keys are saved) into `clientSecrets/{id}`. firestore.rules deny
  clientSecrets even to admins; only the Admin SDK reads it. `sendingAccount()`
  (`lib/clients-server.ts`) picks the key for test + real sends and refuses a sender
  outside the account's verified domains (exact match: Resend verifies subdomains
  separately). A client in use by a blast can't be deleted. This deliberately relaxes the
  old "no secrets in the database" rule for client keys only, sealed and server-only.
- **People added by hand** ("Add a person" in Recipients or the blast menu): one email (+
  optional name) at a time, no file. They go in the blast's own list with the fixed id
  `handListId(blastId)` = `<blastId>-added` (`manual: true`, name "Added by hand"), so the
  audience, tracking and unsubscribe code treat them like an uploaded file, and they never
  touch Leads. `POST /api/blasts/people/{add,remove}` (`addPerson`/`removePerson` in
  `lib/blasts/server.ts`): adding refuses an address already anywhere in the blast (409);
  removing the last one deletes the list unless it's the blast's only source.
- **Client report** ("Report" in the blast page's top bar, Mandy 2026-10-09): an
  AuraPixel-branded email for the client: people on the list, emailed, still to send,
  delivered / bounced (and opened / clicked when the sending domain tracks them),
  unsubscribed, and send rounds by Malaysia-time day. `lib/blasts/report.ts` (pure,
  tested) builds and renders it, so the dialog preview, Save as PDF (prints a popup
  copy) and the sent email match. `lib/blasts/report-server.ts` reads what happened to
  each email from the Resend account it went out through: Resend has no per-blast
  query, so it pages `GET /emails` (newest first, `after` = older, 100 a page, 10 req/s)
  back to the blast's first send and matches the stored `resendId`s by `last_event`
  (one event per email, so a re-open after a click counts as opened only). A
  sending-only key can't read this, so the report falls back to Ops' own counts.
  Opens/clicks need tracking on the DOMAIN in that Resend account, and that needs a
  tracking CNAME in the client's DNS, so Ops can't switch it on; the dialog says when
  they aren't tracked. Reports always go from AuraPixel's own account and sender
  (Settings → Email), reply-to the admin, optional copy and CSV of everyone with their
  status; `blasts/{id}.lastReport` remembers who it went to.
- **No explanatory copy on the blast screens** (Mandy, 2026-10-09): no page intros, card
  descriptions or field hints. Labels, counts, errors and warnings only.
- **Custom designs** (`email.design: "standard" | "custom"`, `email.html`): a client's own
  finished email (HTML) instead of Ops' layout. `lib/blasts/html.ts` (pure, tested) finds
  and edits links and images by string surgery so the designer's markup is untouched
  (comments are masked, so Outlook-only blocks aren't listed), strips scripts/frames/
  forms/on* handlers/javascript: links, adds https:// to bare links, and makes the text
  version. In the editor (`components/blasts/custom-design.tsx`) the .html is dropped
  together with its images: local `src`s are matched by file name, uploaded through
  `/api/blasts/banner` (blastAssets, deleted with the blast) and rewritten to public links.
  The **Links** list edits every href in place (button redirects, UTM links). Saving
  refuses broken links; SENDING also needs every link filled (no "#") and no local images.
  `{name}` and `{unsubscribe_url}` work in the HTML; without `{unsubscribe_url}` an
  Unsubscribe line is added before `</body>`. Switching layouts keeps both versions.
- **Preview must never re-download images**: the preview iframe is sandboxed (opaque
  origin, no shared cache), so it rebuilds on every keystroke and re-fetched the banner
  each time. That burst made Vercel's Security Checkpoint challenge the office IP and
  saves failed with a bare 403 (`x-vercel-mitigated: challenge`). Every uploaded image
  is fetched once and inlined as a data: URL (`useAssetDataUrls` in `email-tab.tsx`).
  `apiPost` reports non-JSON errors as "blocked on the way".
- **Unsubscribe**: every email has an Unsubscribe link (`/unsubscribe?b&e&t`, public page
  outside the auth gate; nothing happens until the person presses the button, because
  link scanners open links) and `List-Unsubscribe` + `List-Unsubscribe-Post` one-click
  headers (POST `/api/unsubscribe?b&e&t`). The token is random per recipient doc.
  `unsubscribes/{email}` applies to EVERY blast. Links always use
  `https://www.aurapixel.live` (`OPS_PUBLIC_ORIGIN`): the apex redirects, and one-click
  POSTs don't follow redirects.
- **Banners** are resized in the browser (≤1200px, ≤880 KB JPEG unless a small PNG/GIF)
  and stored as bytes in `blastAssets/{id}` (Firestore 1 MiB doc limit; aurapixel-ops is
  on Spark with no Storage bucket), served publicly with a 1-year cache by
  `GET /api/blasts/banner/[id]`.
- **Resend**: AuraPixel's own `RESEND_API_KEY` on Vercel (sensitive, production) + `.env.local`, set by
  `npm run setup:email` (Mandy runs it; it can reuse RSVP's key and redeploys). Sender
  addresses must be on a domain verified in Resend (aurapixel.live is). Without the key,
  sends and test sends return a 503 saying to run it. Testing: send to Resend's test
  addresses `delivered+anything@resend.dev` (accepted, never delivered, no reputation hit).
- **Settings** (`/settings`): `lib/settings.ts` is the single source for sections
  (email, assistant, scoring), their starting values and validation; the form
  (`components/settings/use-settings-form.ts`, edits-over-live-values, no effects)
  and `POST /api/settings` run the same `validateSettings`. Stored at
  `settings/{section}`. Secrets never go in settings: `POST /api/settings/status`
  only reports whether `ANTHROPIC_API_KEY` / `N8N_WEBHOOK_URL` + `OPS_WEBHOOK_SECRET`
  are set.
- **Roles** (`lib/roles.ts`): custom claims. Admin = `{admin: true, role: "admin"}`
  (firestore.rules checks `admin`); client = `{role: "client"}`. Clients sign in to a
  "client area is being set up" screen in `AuthGate`; they can read nothing in Firestore
  and every API refuses them. What clients will actually see is still to be decided.
- **Users** (Settings → Users, `/api/users/{list,create,update,set-password,reset-link,delete}`
  via `lib/admin-route.ts`): Firebase Auth is the source of truth; `users/{uid}` holds
  profile extras (business name, createdBy). Guards on the server: you can't delete,
  suspend or change the role of yourself, and nobody can remove the last active admin.
  Role changes, suspensions and other people's password changes revoke their sessions.
  `verifyAdmin` checks revocation (`verifyIdToken(token, true)`). Generated passwords:
  `lib/users.ts#generatePassword`, shown once in the credentials dialog. When admins
  change their own password the UI signs them straight back in, so the session survives.
- Next 16.4 keeps pages alive between visits (`<Activity>`), so a revisited live list
  shows the old rows for about 200 ms before the Firestore listener catches up. Tests
  must wait for the list to settle.
- `firebase-admin@14` needs the `jose` v5 override in package.json or Admin SDK
  routes 500 on Vercel (same as PXL Booth). Keep it.

## Running locally

```bash
npm run dev         # http://localhost:3100/ops → the real project aurapixel-ops (.env.local)
```

There is no emulator, test login or sample data any more (removed 2026-10-07 at
Mandy's request: "delete all the mocks"). Everything runs against the real database.
For automated checks, create a temporary `*@aurapixel.test` admin with the Admin SDK,
and delete it and everything it created afterwards (never touch real accounts).

### The real project: aurapixel-ops

- Created by Mandy 2026-10-07 under **aurapixelcreativestudio@gmail.com** (gcloud's
  account on this Mac; we're Owner). Spark plan. Firestore `(default)` in
  **asia-southeast1**. Web app "AuraPixel Ops" registered; its public config is in `.env.local`.
- **Rules:** `npm run deploy:rules` publishes `firestore.rules` through the Rules API
  with the gcloud token (the firebase CLI here defaults to an unrelated account).
  `scripts/gcloud-api.mjs` refuses RSVP / pxlchat / PXL Booth projects.
- **Admins:** `npm run grant-admin -- email@x` sets `{admin: true, role: "admin"}`
  through the Identity Toolkit API. The user must already exist and must sign in again.
- **Sign-in setup:** `npm run setup:signin` (Mandy runs it in her Terminal; `-- --check`
  is read-only). It switches on Email/Password with
  `firebase.googleapis.com/v1alpha/firebase:provisionFirebaseApp`
  (`firebaseAuthInput.emailAuthProviderMode`), the path `firebase deploy --only auth` uses.
  `identityPlatform:initializeAuth` fails on Spark with BILLING_NOT_ENABLED. The script also
  adds authorised domains, creates the admin with a hidden password prompt, and test-signs-in.
- **Server credentials:** the org enforces `iam.disableServiceAccountKeyCreation`, so no
  key files. Locally the Admin SDK uses Application Default Credentials
  (`gcloud auth application-default login`, as aurapixelcreativestudio) with
  `GOOGLE_CLOUD_QUOTA_PROJECT=aurapixel-ops`. Missing ADC → API routes return a 503
  saying what to run (`lib/server-errors.ts`). On Vercel the Admin SDK signs in with
  keyless **Workload Identity Federation**: Vercel's per-request OIDC token (`@vercel/oidc`,
  team issuer `https://oidc.vercel.com/aurapixelcs-projects`) is traded for the
  `ops-server@aurapixel-ops` service account (roles: datastore.user, firebaseauth.admin).
  Only `owner:aurapixelcs-projects:project:apxl-ops:environment:production` is trusted, so
  preview deployments can't reach the database. Google side: `npm run setup:vercel-access`
  (Mandy runs it; the auto-mode classifier blocks IAM grants). Vercel env:
  `GCP_WORKLOAD_IDENTITY_PROVIDER` + `GCP_SERVICE_ACCOUNT_EMAIL`. firebase-admin's
  `getFirestore()` rejects custom credentials, so `adminDb()` builds the Firestore client
  itself with `authClient` (`preferRest: true` for faster cold starts).
- Never put these rules into `aurapixel-rsvp`: rules are project-wide.

Real Meta exports contain real people's data: test with them in place, never commit
them. (`openjdk@21` was installed only for the removed emulator; it can be uninstalled.)
A verification build beside the dev servers: `OPS_DIST_DIR=.next-build npx next build`.

## Deploying

Git push to `main` on `AuraPixelCS/APXL_OPS` deploys to production (Vercel project
`apxl-ops` in aurapixelcs-projects, region sin1 next to Firestore). The landing page
(`../landing-page/next.config.ts`) rewrites `/ops` and `/ops/:path*` to
`https://apxl-ops.vercel.app/ops…`. CLI work needs the AuraPixel token and scope:
`--scope aurapixelcs-projects --token="$(cat ~/.config/aurapixel/vercel-token)"`.
