// Turns on email sending (blasts) for AuraPixel Ops: checks a Resend API key,
// stores it on the Vercel project apxl-ops (as a sensitive production variable)
// and in .env.local for local dev, then redeploys production so it takes effect.
//
//   npm run setup:email              asks for the key (hidden), or reuses RSVP's
//   npm run setup:email -- --check   read-only: is it set, which domains can send?
//
// The key is never printed. Uses the AuraPixel Vercel token at
// ~/.config/aurapixel/vercel-token.
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { createInterface } from "node:readline"

const TEAM = "team_15ala3aDD9Nfk2Vwrjttpiv4" // aurapixelcs-projects
const PROJECT = "apxl-ops"
const ENV_LOCAL = new URL("../.env.local", import.meta.url)
const RSVP_ENV = new URL("../../rsvp/.env.local", import.meta.url)
const CHECK = process.argv.includes("--check")
const ok = (m) => console.log(`  ✓ ${m}`)
const info = (m) => console.log(`  • ${m}`)

const token = readFileSync(`${homedir()}/.config/aurapixel/vercel-token`, "utf8").trim()

async function vercel(method, path, body) {
  const url = `https://api.vercel.com${path}${path.includes("?") ? "&" : "?"}teamId=${TEAM}`
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Vercel ${method} ${path} → ${res.status}: ${data.error?.message ?? JSON.stringify(data)}`)
  return data
}

function readEnvKey(file, key) {
  if (!existsSync(file)) return ""
  const line = readFileSync(file, "utf8").split("\n").find((l) => l.startsWith(`${key}=`))
  return line ? line.slice(key.length + 1).trim().replace(/^["']|["']$/g, "") : ""
}

async function ask(question, { hidden = false } = {}) {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  if (hidden) {
    const write = rl._writeToOutput.bind(rl)
    rl._writeToOutput = (s) => write(s.startsWith(question) ? s : s.replace(/[^\r\n]/g, "•"))
  }
  const answer = await new Promise((resolve) => rl.question(question, resolve))
  rl.close()
  return answer.trim()
}

/** Which domains this key can send from (needs a full-access key to list). */
async function checkKey(key) {
  const res = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${key}` } })
  const data = await res.json().catch(() => ({}))
  if (res.ok) {
    const domains = (data.data ?? []).map((d) => `${d.name} (${d.status})`)
    ok(`key works. Domains: ${domains.join(", ") || "none yet"}`)
    if (!(data.data ?? []).some((d) => d.status === "verified"))
      info("No verified domain yet: verify one in Resend (Domains) before sending.")
    return true
  }
  if (data.name === "restricted_api_key") {
    ok("key works (sending-only key, so it can't list domains; that's fine)")
    return true
  }
  console.log(`  ✗ Resend rejected the key: ${data.message ?? res.status}`)
  return false
}

console.log(`\nAuraPixel Ops email setup → Vercel project ${PROJECT}${CHECK ? "  [check only]" : ""}\n`)

const project = await vercel("GET", `/v9/projects/${PROJECT}`)
const { envs = [] } = await vercel("GET", `/v9/projects/${project.id}/env`)
const existing = envs.find((e) => e.key === "RESEND_API_KEY")

if (CHECK) {
  console.log("Vercel")
  if (existing) ok(`RESEND_API_KEY is set (${existing.type}, ${existing.target.join(", ")})`)
  else info("RESEND_API_KEY is not set")
  console.log("This Mac (.env.local)")
  const local = readEnvKey(ENV_LOCAL, "RESEND_API_KEY")
  if (local) await checkKey(local)
  else info("not set (local dev can't send)")
  process.exit(0)
}

console.log("1. The Resend API key")
const rsvpKey = readEnvKey(RSVP_ENV, "RESEND_API_KEY")
let key = await ask(
  rsvpKey
    ? "  Paste a Resend API key (hidden), or press Enter to reuse the RSVP project's key: "
    : "  Paste a Resend API key (hidden): ",
  { hidden: true }
)
if (!key && rsvpKey) {
  key = rsvpKey
  info("using the same key as RSVP")
}
if (!/^re_[A-Za-z0-9_]+$/.test(key)) {
  console.log("  ✗ That doesn't look like a Resend key (they start with re_). Nothing changed.")
  process.exit(1)
}
if (!(await checkKey(key))) process.exit(1)

console.log("\n2. Vercel (production)")
await vercel("POST", `/v10/projects/${project.id}/env?upsert=true`, {
  key: "RESEND_API_KEY",
  value: key,
  type: "sensitive",
  target: ["production"],
})
ok(existing ? "RESEND_API_KEY updated" : "RESEND_API_KEY added")

console.log("\n3. This Mac (.env.local, for npm run dev)")
let local = existsSync(ENV_LOCAL) ? readFileSync(ENV_LOCAL, "utf8") : ""
local = /^RESEND_API_KEY=.*$/m.test(local)
  ? local.replace(/^RESEND_API_KEY=.*$/m, `RESEND_API_KEY=${key}`)
  : `${local.replace(/\n*$/, "\n")}\n# Email blasts (Resend). Set by npm run setup:email.\nRESEND_API_KEY=${key}\n`
writeFileSync(ENV_LOCAL, local)
ok("saved (restart npm run dev to pick it up)")

console.log("\n4. Redeploy production so the key takes effect")
const { deployments = [] } = await vercel(
  "GET",
  `/v6/deployments?projectId=${project.id}&target=production&state=READY&limit=1`
)
if (!deployments[0]) {
  info("No production deployment yet: the next git push will use the key.")
} else {
  const d = await vercel("POST", `/v13/deployments?forceNew=1`, {
    name: PROJECT,
    deploymentId: deployments[0].uid,
    target: "production",
  })
  ok(`redeploying (${d.id}). Live in about 2 minutes at https://www.aurapixel.live/ops`)
}
console.log("\nDone. Settings → Connections in Ops should show Sending email as Ready.\n")
