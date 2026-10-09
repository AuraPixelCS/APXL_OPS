"use client"

// Public: confirm, then unsubscribe. Nothing happens on page load, because mail
// security scanners open links; the person has to press the button.

import { CircleCheckIcon, MailXIcon, TriangleAlertIcon } from "lucide-react"
import { useSearchParams } from "next/navigation"
import * as React from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { withBasePath } from "@/lib/base-path"

type State = "ask" | "busy" | "done" | "error"

export function UnsubscribePage() {
  const params = useSearchParams()
  const b = params.get("b") ?? ""
  const e = params.get("e") ?? ""
  const t = params.get("t") ?? ""
  const isTest = params.get("test") === "1"
  const [state, setState] = React.useState<State>("ask")
  const [error, setError] = React.useState("")

  async function unsubscribe() {
    setState("busy")
    try {
      const res = await fetch(withBasePath("/api/unsubscribe"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ b, e, t }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.")
      setState("done")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.")
      setState("error")
    }
  }

  const valid = Boolean(b && e && t)

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="flex w-full max-w-md flex-col gap-5 rounded-2xl border bg-card p-6 sm:p-8">
        {state === "done" ? (
          <>
            <CircleCheckIcon className="size-8 text-success" aria-hidden />
            <div className="space-y-1.5">
              <h1 className="font-heading text-xl font-semibold">
                You&rsquo;re unsubscribed
              </h1>
              <p className="text-sm text-muted-foreground">
                <span className="text-foreground">{e}</span> won&rsquo;t get
                these emails any more. You can close this page.
              </p>
            </div>
          </>
        ) : (
          <>
            <MailXIcon className="size-8 text-muted-foreground" aria-hidden />
            <div className="space-y-1.5">
              <h1 className="font-heading text-xl font-semibold">
                Unsubscribe
              </h1>
              <p className="text-sm text-muted-foreground">
                {isTest ? (
                  "This was a test email, so there's nothing to unsubscribe from. In a real email this link stops all further emails to that person."
                ) : valid ? (
                  <>
                    Stop sending emails like this to{" "}
                    <span className="break-all text-foreground">{e}</span>?
                  </>
                ) : (
                  "This link is incomplete. Reply to the email and ask to be removed, and we'll do it."
                )}
              </p>
            </div>
            {state === "error" && (
              <Alert variant="destructive">
                <TriangleAlertIcon />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {valid && !isTest && (
              <Button
                size="xl"
                onClick={unsubscribe}
                disabled={state === "busy"}
              >
                {state === "busy" && <Spinner />}
                Unsubscribe
              </Button>
            )}
          </>
        )}
      </div>
    </main>
  )
}
