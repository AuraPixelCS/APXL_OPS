// Lets the Vercel deployment use aurapixel-ops without a key file (the AuraPixel
// org blocks service-account keys). Vercel signs every request with an OIDC
// token; Google's Workload Identity Federation trades it for a short-lived token
// for the ops-server service account, which can only use Firestore and manage
// Firebase Auth users. Only apxl-ops production deployments are trusted.
//
//   npm run setup:vercel-access              set it up (safe to re-run)
//   npm run setup:vercel-access -- --check   read-only: show what's there
//
// Runs gcloud as the account signed in on this Mac (aurapixelcreativestudio).
// Prints the two env vars the Vercel project needs.
import { execFileSync } from "node:child_process"
import { assertOpsProject, gcloudAccount, OPS_PROJECT } from "./gcloud-api.mjs"

const PROJECT = OPS_PROJECT
const TEAM = "aurapixelcs-projects" // Vercel team slug (OIDC issuer: team mode)
const VERCEL_PROJECT = "apxl-ops"
const POOL = "vercel"
const PROVIDER = "vercel"
const SA_ID = "ops-server"
const SA = `${SA_ID}@${PROJECT}.iam.gserviceaccount.com`
const ROLES = ["roles/datastore.user", "roles/firebaseauth.admin"]
const APIS = ["iam.googleapis.com", "iamcredentials.googleapis.com", "sts.googleapis.com"]
const SUBJECT = `owner:${TEAM}:project:${VERCEL_PROJECT}:environment:production`

const check = process.argv.includes("--check")
assertOpsProject(PROJECT)

function gcloud(args, { quiet = false } = {}) {
  try {
    return execFileSync("gcloud", [...args, `--project=${PROJECT}`, "--quiet"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", quiet ? "ignore" : "inherit"],
    }).trim()
  } catch (err) {
    if (quiet) return null
    throw err
  }
}

const exists = (args) => gcloud(args, { quiet: true }) !== null
const step = (msg) => console.log(`\n▸ ${msg}`)

console.log(`${check ? "Checking" : "Setting up"} Vercel → ${PROJECT} access as ${gcloudAccount()}`)
const projectNumber = gcloud(["projects", "describe", PROJECT, "--format=value(projectNumber)"])
const providerName = `projects/${projectNumber}/locations/global/workloadIdentityPools/${POOL}/providers/${PROVIDER}`
const principal = `principal://iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${POOL}/subject/${SUBJECT}`

step("APIs")
const enabled = gcloud(["services", "list", "--enabled", "--format=value(config.name)"]).split("\n")
const missingApis = APIS.filter((a) => !enabled.includes(a))
if (!missingApis.length) console.log("  all enabled")
else if (check) console.log(`  missing: ${missingApis.join(", ")}`)
else gcloud(["services", "enable", ...missingApis])

step(`Service account ${SA}`)
if (exists(["iam", "service-accounts", "describe", SA])) console.log("  exists")
else if (check) console.log("  missing")
else
  gcloud([
    "iam", "service-accounts", "create", SA_ID,
    "--display-name=Ops server (Vercel)",
    "--description=AuraPixel Ops API routes on Vercel, via Workload Identity Federation. No keys.",
  ])

step(`Roles for ${SA_ID}`)
const granted = (gcloud([
  "projects", "get-iam-policy", PROJECT,
  "--flatten=bindings[].members",
  `--filter=bindings.members:serviceAccount:${SA}`,
  "--format=value(bindings.role)",
], { quiet: true }) ?? "").split("\n")
for (const role of ROLES) {
  if (granted.includes(role)) console.log(`  ${role} ✓`)
  else if (check) console.log(`  ${role} missing`)
  else {
    gcloud(["projects", "add-iam-policy-binding", PROJECT, `--member=serviceAccount:${SA}`, `--role=${role}`, "--condition=None", "--format=none"])
    console.log(`  ${role} granted`)
  }
}

step(`Workload identity pool "${POOL}"`)
if (exists(["iam", "workload-identity-pools", "describe", POOL, "--location=global"])) console.log("  exists")
else if (check) console.log("  missing")
else
  gcloud([
    "iam", "workload-identity-pools", "create", POOL, "--location=global",
    "--display-name=Vercel", "--description=Vercel deployments of AuraPixel Ops",
  ])

step(`OIDC provider "${PROVIDER}"`)
const providerArgs = [
  `--workload-identity-pool=${POOL}`, "--location=global",
  `--issuer-uri=https://oidc.vercel.com/${TEAM}`,
  `--allowed-audiences=https://vercel.com/${TEAM}`,
  "--attribute-mapping=google.subject=assertion.sub",
  `--attribute-condition=assertion.sub == "${SUBJECT}"`,
]
if (exists(["iam", "workload-identity-pools", "providers", "describe", PROVIDER, `--workload-identity-pool=${POOL}`, "--location=global"])) {
  if (check) console.log("  exists")
  else {
    gcloud(["iam", "workload-identity-pools", "providers", "update-oidc", PROVIDER, ...providerArgs])
    console.log("  exists (settings refreshed)")
  }
} else if (check) console.log("  missing")
else gcloud(["iam", "workload-identity-pools", "providers", "create-oidc", PROVIDER, "--display-name=Vercel", ...providerArgs])

step("Who may act as the service account")
const saPolicy = gcloud(["iam", "service-accounts", "get-iam-policy", SA, "--format=json"], { quiet: true })
const trusted = saPolicy?.includes(principal)
if (trusted) console.log(`  ${SUBJECT} ✓`)
else if (check) console.log("  Vercel not trusted yet")
else {
  gcloud(["iam", "service-accounts", "add-iam-policy-binding", SA, "--role=roles/iam.workloadIdentityUser", `--member=${principal}`, "--format=none"])
  console.log(`  ${SUBJECT} trusted`)
}

console.log(`\nVercel env vars for ${VERCEL_PROJECT} (not secrets):`)
console.log(`  GCP_WORKLOAD_IDENTITY_PROVIDER=${providerName}`)
console.log(`  GCP_SERVICE_ACCOUNT_EMAIL=${SA}`)
