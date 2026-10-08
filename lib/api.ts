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
  const data = (await res.json().catch(() => ({}))) as {
    error?: string
    fields?: Record<string, string>
  }
  if (!res.ok)
    throw new ApiError(
      data.error ?? `Something went wrong (${res.status}).`,
      data.fields
    )
  return data as T
}
