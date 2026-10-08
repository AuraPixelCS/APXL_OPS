// One-time sign-in setup for the REAL Ops project (aurapixel-ops). Run it in
// your own Terminal:
//
//   npm run setup:signin              do it
//   npm run setup:signin -- --check   only look, change nothing
//
//   1. Switches on Email/Password sign-in, using the same Firebase API as the
//      console's "Get started" button and `firebase deploy --only auth`.
//   2. Allows sign-in from localhost and aurapixel.live.
//   3. Creates your admin account. Asks for the email and password HERE; the
//      password is typed as dots and never stored, printed or sent anywhere
//      except Firebase.
//   4. Signs in as you to prove the admin access works.
//
// Safe to run again: every step skips what's already done.
// Calls Google as the gcloud account on this Mac (aurapixelcreativestudio).

import { readFileSync } from "node:fs"
import { createInterface } from "node:readline"
import { assertOpsProject, gcloudAccount, googleApi, OPS_PROJECT } from "./gcloud-api.mjs"

const P = OPS_PROJECT
const CHECK = process.argv.includes("--check")
const ok = (m) => console.log(`  ✓ ${m}`)
const info = (m) => console.log(`  • ${m}`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
)
if (env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== P) {
  throw new Error(`.env.local points at "${env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}", expected ${P}.`)
}
assertOpsProject(P)
const APP_ID = env.NEXT_PUBLIC_FIREBASE_APP_ID
const API_KEY = env.NEXT_PUBLIC_FIREBASE_API_KEY

async function authConfig() {
  try {
    return await googleApi("GET", `https://identitytoolkit.googleapis.com/admin/v2/projects/${P}/config`, P)
  } catch (e) {
    if (/CONFIGURATION_NOT_FOUND|→ 404/.test(e.message)) return null
    throw e
  }
}

async function ask(question, { hidden = false } = {}) {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  if (hidden) {
    const write = rl._writeToOutput.bind(rl)
    rl._writeToOutput = (s) => write(s.startsWith(question) ? s : s.replace(/[^\r\n]/g, "•"))
  }
  const answer = await new Promise((resolve) => rl.question(question, resolve))
  rl.close()
  return answer
}

console.log(`\nAuraPixel Ops sign-in setup → ${P} (as ${gcloudAccount()})${CHECK ? "  [check only]" : ""}\n`)

// 1. Email/Password sign-in
console.log("1. Email/Password sign-in")
let cfg = await authConfig()
if (cfg?.signIn?.email?.enabled) {
  ok("already on")
} else if (CHECK) {
  info("OFF. Run without --check to switch it on.")
} else {
  const op = await googleApi("POST", "https://firebase.googleapis.com/v1alpha/firebase:provisionFirebaseApp", P, {
    appNamespace: APP_ID,
    parent: `projects/${P}`,
    firebaseAuthInput: { emailAuthProviderMode: "PROVIDER_ENABLED" },
    webInput: {},
  })
  for (let i = 0; i < 90; i++) {
    const o = await googleApi("GET", `https://firebase.googleapis.com/v1beta1/${op.name}`, P)
    if (o.done) {
      if (o.error) throw new Error(`Firebase couldn't switch it on: ${o.error.message}`)
      break
    }
    await sleep(2000)
  }
  cfg = await authConfig()
  if (!cfg?.signIn?.email?.enabled) {
    throw new Error(
      "Firebase finished but Email/Password still isn't on. Switch it on by hand: " +
        `https://console.firebase.google.com/project/${P}/authentication/providers`
    )
  }
  ok("switched on")
}

// 2. Where people may sign in from
console.log("2. Allowed sign-in domains")
const wanted = ["localhost", `${P}.firebaseapp.com`, `${P}.web.app`, "aurapixel.live", "www.aurapixel.live"]
const have = cfg?.authorizedDomains ?? []
const missing = wanted.filter((d) => !have.includes(d))
if (!cfg) info("skipped until sign-in is on")
else if (missing.length === 0) ok(have.join(", "))
else if (CHECK) info(`would add: ${missing.join(", ")}`)
else {
  await googleApi(
    "PATCH",
    `https://identitytoolkit.googleapis.com/admin/v2/projects/${P}/config?updateMask=authorizedDomains`,
    P,
    { authorizedDomains: [...have, ...missing] }
  )
  ok(`added ${missing.join(", ")}`)
}

// 3. Your admin account
console.log("3. Your admin account")
const accounts = `https://identitytoolkit.googleapis.com/v1/projects/${P}/accounts`
if (CHECK) {
  if (!cfg) info("skipped until sign-in is on")
  else {
    const { users = [] } = await googleApi("GET", `${accounts}:batchGet?maxResults=100`, P)
    const admins = users.filter((u) => JSON.parse(u.customAttributes ?? "{}").admin === true)
    info(`${users.length} account(s), ${admins.length} admin(s)${admins.length ? `: ${admins.map((u) => u.email).join(", ")}` : ""}`)
  }
  console.log("\nCheck finished. Nothing was changed.\n")
  process.exit(0)
}
if (!process.stdin.isTTY) throw new Error("Run this in your own Terminal so it can ask for your password.")

const email = (await ask("   Email for your Ops login: ")).trim().toLowerCase()
if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) throw new Error("That doesn't look like an email address.")

const { users = [] } = await googleApi("POST", `${accounts}:lookup`, P, { email: [email] })
let user = users[0]
let password = null
if (user) {
  ok(`${email} already exists; keeping its password`)
} else {
  password = await ask("   Choose a password (at least 8 characters): ", { hidden: true })
  if (password.length < 8) throw new Error("Use at least 8 characters.")
  const again = await ask("   Type it again: ", { hidden: true })
  if (again !== password) throw new Error("The two passwords didn't match. Nothing was created; run it again.")
  user = await googleApi("POST", accounts, P, { email, password, emailVerified: true })
  ok(`created ${email}`)
}
const claims = JSON.parse(user.customAttributes ?? "{}")
await googleApi("POST", `${accounts}:update`, P, {
  localId: user.localId,
  customAttributes: JSON.stringify({ ...claims, admin: true, role: "admin" }),
})
ok("admin access granted")

// 4. Prove it: sign in the way the Ops login page does
console.log("4. Test sign-in")
if (!password) {
  info("skipped (existing account). Sign in at http://localhost:3100/ops to check.")
} else {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Test sign-in failed: ${data.error?.message ?? res.status}`)
  const payload = JSON.parse(Buffer.from(data.idToken.split(".")[1], "base64url").toString())
  if (payload.admin !== true) throw new Error("Signed in, but the admin flag isn't on the token yet. Run this again.")
  ok("signed in as an admin")
}

console.log(`\nDone. Open http://localhost:3100/ops and sign in as ${email}.\n`)
