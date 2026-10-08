// Gives an existing Firebase Auth user admin access to Ops (or takes it away).
//   npm run grant-admin -- someone@example.com
//   npm run grant-admin -- someone@example.com --revoke
// The person must already exist (Firebase console → Authentication → Add user).
// They need to sign out and back in for the change to apply.
import { assertOpsProject, gcloudAccount, googleApi, OPS_PROJECT } from "./gcloud-api.mjs"

const email = process.argv[2]
const revoke = process.argv.includes("--revoke")
const project = OPS_PROJECT
if (!email || !email.includes("@")) {
  console.error("Usage: npm run grant-admin -- someone@example.com [--revoke]")
  process.exit(1)
}
assertOpsProject(project)

const base = `https://identitytoolkit.googleapis.com/v1/projects/${project}`
const { users = [] } = await googleApi("POST", `${base}/accounts:lookup`, project, { email: [email] })
const user = users[0]
if (!user) {
  console.error(`No account for ${email} in ${project}. Add it in Firebase console → Authentication first.`)
  process.exit(1)
}
const claims = JSON.parse(user.customAttributes ?? "{}")
if (revoke) {
  delete claims.admin
  delete claims.role
} else {
  claims.admin = true
  claims.role = "admin" // ready for the planned admin / client split
}
await googleApi("POST", `${base}/accounts:update`, project, {
  localId: user.localId,
  customAttributes: JSON.stringify(claims),
})
console.log(`${revoke ? "Removed admin from" : "Granted admin to"} ${email} in ${project} (by ${gcloudAccount()}).`)
