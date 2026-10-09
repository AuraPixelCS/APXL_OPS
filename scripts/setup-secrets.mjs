// One-time: makes the key that seals clients' Resend keys (Settings → Clients)
// before they're stored. 32 random bytes, kept on the Vercel project apxl-ops
// (sensitive, production) and in .env.local (the same key, so local dev can
// read what production stored). Then redeploys production.
//
//   npm run setup:secrets              set it up (does nothing if already done)
//   npm run setup:secrets -- --check   read-only: is it set, where?
//   npm run setup:secrets -- --replace a NEW key everywhere (saved client keys
//                                      then have to be pasted again)
//
// The key is never printed. Uses the AuraPixel Vercel token at
// ~/.config/aurapixel/vercel-token.
import { randomBytes } from "node:crypto"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"

const TEAM = "team_15ala3aDD9Nfk2Vwrjttpiv4" // aurapixelcs-projects
const PROJECT = "apxl-ops"
const NAME = "OPS_SECRETS_KEY"
const ENV_LOCAL = new URL("../.env.local", import.meta.url)
const CHECK = process.argv.includes("--check")
const REPLACE = process.argv.includes("--replace")
const ok = (m) => console.log(`  ✓ ${m}`)
const info = (m) => console.log(`  • ${m}`)

const token = readFileSync(
  `${homedir()}/.config/aurapixel/vercel-token`,
  "utf8"
).trim()

async function vercel(method, path, body) {
  const url = `https://api.vercel.com${path}${path.includes("?") ? "&" : "?"}teamId=${TEAM}`
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok)
    throw new Error(
      `Vercel ${method} ${path} → ${res.status}: ${data.error?.message ?? JSON.stringify(data)}`
    )
  return data
}

function readLocal() {
  if (!existsSync(ENV_LOCAL)) return ""
  const line = readFileSync(ENV_LOCAL, "utf8")
    .split("\n")
    .find((l) => l.startsWith(`${NAME}=`))
  return line ? line.slice(NAME.length + 1).trim() : ""
}

function writeLocal(value) {
  let text = existsSync(ENV_LOCAL) ? readFileSync(ENV_LOCAL, "utf8") : ""
  const re = new RegExp(`^${NAME}=.*$`, "m")
  text = re.test(text)
    ? text.replace(re, `${NAME}=${value}`)
    : `${text.replace(/\n*$/, "\n")}\n# Seals clients' Resend keys. Set by npm run setup:secrets; don't change it.\n${NAME}=${value}\n`
  writeFileSync(ENV_LOCAL, text)
}

const valid = (v) => Buffer.from(v, "base64").length === 32

console.log(
  `\nAuraPixel Ops client-key sealing → Vercel project ${PROJECT}${CHECK ? "  [check only]" : ""}\n`
)

const project = await vercel("GET", `/v9/projects/${PROJECT}`)
const { envs = [] } = await vercel("GET", `/v9/projects/${project.id}/env`)
const onVercel = envs.some((e) => e.key === NAME)
const local = readLocal()

if (CHECK) {
  if (onVercel) ok(`${NAME} is set on Vercel`)
  else info(`${NAME} is not set on Vercel`)
  if (local && valid(local)) ok(`${NAME} is in .env.local`)
  else info(`${NAME} is not in .env.local`)
  process.exit(0)
}

let value = ""
if (REPLACE) {
  value = randomBytes(32).toString("base64")
  info("making a NEW key: clients' saved Resend keys will need pasting again")
} else if (onVercel && local && valid(local)) {
  ok("already set up on Vercel and in .env.local. Nothing to do.")
  process.exit(0)
} else if (local && valid(local)) {
  value = local
  info("using the key already in .env.local")
} else if (onVercel) {
  console.log(
    `  ✗ ${NAME} is on Vercel but not in .env.local, and Vercel won't show it.\n` +
      "    Either leave it (production works; local dev can't read client keys),\n" +
      "    or run `npm run setup:secrets -- --replace` and paste clients' keys again."
  )
  process.exit(1)
} else {
  value = randomBytes(32).toString("base64")
}

console.log("1. Vercel (production)")
await vercel("POST", `/v10/projects/${project.id}/env?upsert=true`, {
  key: NAME,
  value,
  type: "sensitive",
  target: ["production"],
})
ok(onVercel ? `${NAME} replaced` : `${NAME} added`)

console.log("\n2. This Mac (.env.local)")
writeLocal(value)
ok("saved (restart npm run dev to pick it up)")

console.log("\n3. Redeploy production so it takes effect")
const { deployments = [] } = await vercel(
  "GET",
  `/v6/deployments?projectId=${project.id}&target=production&state=READY&limit=1`
)
if (!deployments[0]) {
  info("No production deployment yet: the next git push will use it.")
} else {
  const d = await vercel("POST", `/v13/deployments?forceNew=1`, {
    name: PROJECT,
    deploymentId: deployments[0].uid,
    target: "production",
  })
  ok(
    `redeploying (${d.id}). Live in about 2 minutes at https://www.aurapixel.live/ops`
  )
}
console.log(
  "\nDone. Settings → Clients can now store each client's Resend key.\n"
)
