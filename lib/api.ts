// Browser → our API routes. Adds the signed-in admin's ID token and the /ops
// base path, and turns error responses into ApiErrors carrying the server's
// message (and, for forms, which fields need fixing).

import { getClientAuth } from "@/lib/firebase/client"
import { withBasePath } from "@/lib/base-path"

export class ApiError extends Error {
  constructor(
    message: string,
    readonly fields: Record<string, string> = {}
  ) {
    super(message)
  }
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const user = getClientAuth()?.currentUser
  if (!user) throw new ApiError("You're signed out. Sign in again.")
  const res = await fetch(withBasePath(path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await user.getIdToken()}`,
    },
    body: JSON.stringify(body),
  })
  const data = (await res.json().catch(() => null)) as {
    error?: string
    fields?: Record<string, string>
  } | null
  if (!res.ok) {
    // Every Ops route answers in JSON; anything else came from the network
    // on the way (Vercel's bot protection, a timeout) and never reached Ops.
    if (!data) throw new ApiError(unreachedMessage(res))
    throw new ApiError(
      data.error ?? `Something went wrong (${res.status}).`,
      data.fields
    )
  }
  return (data ?? {}) as T
}

function unreachedMessage(res: Response): string {
  if (
    res.status === 403 ||
    res.status === 429 ||
    res.headers.has("x-vercel-mitigated")
  )
    return `This didn't reach Ops: the connection was blocked on the way (error ${res.status}). Nothing is lost on this screen. Wait a minute, then try again.`
  return `Ops didn't answer (error ${res.status}). Nothing is lost on this screen. Try again in a moment.`
}
