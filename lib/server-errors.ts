// Turns infrastructure failures into a message the person at the screen can
// act on. Server only.
import { NextResponse } from "next/server"

export function databaseErrorResponse(err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  console.error("[ops] database error:", message)
  // On Vercel the server signs in through Workload Identity Federation
  // (lib/firebase/admin.ts); locally through gcloud's default credentials.
  if (process.env.VERCEL) {
    if (
      /OIDC|sts\.googleapis|iamcredentials|impersonat|invalid_target|unauthorized_client|Unable to|default credentials/i.test(
        message
      )
    ) {
      return NextResponse.json(
        {
          error:
            "The server can't sign in to Google. In ap-ops, run `npm run setup:vercel-access` as aurapixelcreativestudio@gmail.com, then try again.",
        },
        { status: 503 }
      )
    }
  } else if (
    /default credentials|Could not refresh access token|invalid_grant/i.test(
      message
    )
  ) {
    return NextResponse.json(
      {
        error:
          "The server isn't signed in to Google yet. On this Mac, run `gcloud auth application-default login` as aurapixelcreativestudio@gmail.com, then try again.",
      },
      { status: 503 }
    )
  }
  if (/PERMISSION_DENIED|permission/i.test(message)) {
    return NextResponse.json(
      {
        error:
          "The server's Google account doesn't have access to the Ops database.",
      },
      { status: 503 }
    )
  }
  return NextResponse.json(
    { error: "The database didn't respond. Try again in a moment." },
    { status: 503 }
  )
}
