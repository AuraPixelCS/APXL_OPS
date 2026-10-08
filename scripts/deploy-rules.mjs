// Publishes firestore.rules to the real Ops project.
//   npm run deploy:rules            (aurapixel-ops)
// Uses the Firebase Rules API with your gcloud login, so no firebase CLI login
// is needed (the CLI on this Mac defaults to an unrelated account).
import { readFileSync } from "node:fs"
import { assertOpsProject, gcloudAccount, googleApi, OPS_PROJECT } from "./gcloud-api.mjs"

const project = process.argv[2] ?? OPS_PROJECT
assertOpsProject(project)
console.log(`Deploying firestore.rules to ${project} as ${gcloudAccount()}`)

const base = `https://firebaserules.googleapis.com/v1/projects/${project}`
const ruleset = await googleApi("POST", `${base}/rulesets`, project, {
  source: { files: [{ name: "firestore.rules", content: readFileSync("firestore.rules", "utf8") }] },
})
const releaseName = `projects/${project}/releases/cloud.firestore`
const { releases = [] } = await googleApi("GET", `${base}/releases`, project)
const release = releases.some((r) => r.name === releaseName)
  ? await googleApi("PATCH", `https://firebaserules.googleapis.com/v1/${releaseName}`, project, {
      release: { name: releaseName, rulesetName: ruleset.name },
    })
  : await googleApi("POST", `${base}/releases`, project, { name: releaseName, rulesetName: ruleset.name })
console.log(`Live: ${release.name} → ${release.rulesetName}`)
