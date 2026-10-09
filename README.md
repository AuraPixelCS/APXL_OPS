# AuraPixel Ops

AuraPixel's internal operations panel, at aurapixel.live/ops. It starts with
leads: import a CSV, see every lead cleaned and checked, and (next) follow the
email conversation the assistant has with each one.

Built with Next.js 16, Shark UI, lucide icons and Firebase. Dark theme in
AuraPixel blue.

## Run it on your Mac

```bash
npm run dev          # http://localhost:3100/ops
```

Sign in with your own account. Everything is real data in the `aurapixel-ops`
Firebase project. The server needs Google access on your Mac once:
`gcloud auth application-default login` (as aurapixelcreativestudio@gmail.com).

## Live site

https://aurapixel.live/ops. Pushing to `main` on
[AuraPixelCS/APXL_OPS](https://github.com/AuraPixelCS/APXL_OPS) deploys it
automatically (Vercel project `apxl-ops`, team aurapixelcs-projects). The landing
page proxies `/ops` to `apxl-ops.vercel.app/ops`.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | The app on the real database, http://localhost:3100/ops |
| `npm run setup:signin` | One-time: switch on sign-in for the real project and create your admin login |
| `npm run grant-admin -- you@example.com` | Gives an existing account admin access (real project) |
| `npm run deploy:rules` | Publishes the database security rules (real project) |
| `npm run setup:email` | One-time: puts the Resend API key on Vercel (and in `.env.local`) so email blasts can send (`-- --check` to look only) |
| `npm run setup:secrets` | One-time: makes the key that seals clients' Resend keys (Settings → Clients) on Vercel and in `.env.local` (`-- --check` to look only) |
| `npm run setup:vercel-access` | One-time: lets the Vercel deployment use the database without a key file (`-- --check` to look only) |
| `npm test` | Tests the lead-cleaning rules. Add a CSV path to summarise a file |
| `npm run typecheck` / `npm run lint` | Code checks |

## What's built

- Sign-in with Firebase: **admins** get all of Ops; **clients** get their own screen and no access to admin data
- **Leads**: live list with counts, client and sheet filters, status filters (not
  contacted, needs a look, can't email), search, and a card layout on phones
- **Sheets**: every imported file with its title and client; open one to see its leads,
  rename it or delete it
- **Import**: CSV, Excel (.xlsx/.xls), Google Sheets exports, Numbers and .ods; picks the
  tab in multi-tab workbooks, title filled from the file name, client suggested from
  earlier sheets, a cleaned preview, duplicates skipped per client
- **Lead page**: contact details, what's worth checking, the original form answers,
  and the space where the email conversation will appear
- **Email blasts**: pick sheets (or upload a file of people just for that blast; they stay
  out of Leads), write the email (sender, subject, banner, message,
  button, footer) or drop in the client's own design (an HTML file and its images, with
  every link editable, e.g. a redirect for the button), check the live preview and send a
  test, then send in rounds: pick the next
  100 not-sent people and send. Tracks who was sent, who failed and who unsubscribed;
  every email has a working Unsubscribe link
- **Settings → Users**: add admins and clients, edit them, change roles, set or generate
  passwords, email or copy a reset link, suspend or restore access, delete
- **Settings**: the sender and intro email (with a live preview), what the assistant
  knows and how it writes, what makes a lead hot / warm / cold, and a Connections
  tab showing which accounts and keys are still missing

Next: the email flow with n8n (`../pxl-auto`) and the assistant's draft replies.
