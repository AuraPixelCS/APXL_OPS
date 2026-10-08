// Tiny helper for scripts that call Google APIs as the person signed in to
// gcloud on this Mac (aurapixelcreativestudio@gmail.com). No key files: the
// AuraPixel org blocks service-account keys.
import { execSync } from "node:child_process"

export const OPS_PROJECT = "aurapixel-ops"
const FORBIDDEN = new Set(["aurapixel-rsvp", "aurapixel-rsvp-db", "ap-pxlchat", "pxl-booth-db"])

export function assertOpsProject(project) {
  if (FORBIDDEN.has(project)) throw new Error(`Refusing to touch ${project}: it belongs to another AuraPixel app.`)
  if (project.startsWith("demo-")) throw new Error("That's the local emulator project; use npm run seed instead.")
}

export function gcloudAccount() {
  return execSync("gcloud config get-value account", { encoding: "utf8" }).trim()
}

export async function googleApi(method, url, project, body) {
  const token = execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim()
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "x-goog-user-project": project,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status}: ${data.error?.message ?? JSON.stringify(data)}`)
  return data
}
