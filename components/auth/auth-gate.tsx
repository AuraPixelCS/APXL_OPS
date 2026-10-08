"use client"

import { signOut } from "firebase/auth"
import { ShieldAlertIcon, SparklesIcon } from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import * as React from "react"
import { useAuth } from "@/components/auth/auth-provider"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { getClientAuth } from "@/lib/firebase/client"

// Decides what the signed-in area renders: spinner, then a redirect to the
// login page, then the client screen or "no access", then the admin app. The
// data itself is protected by Firestore rules and the API's admin check.
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { configured, loading, user, role } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  React.useEffect(() => {
    if (!configured || loading) return
    if (!user) router.replace(`/login?next=${encodeURIComponent(pathname)}`)
  }, [configured, loading, user, router, pathname])

  async function handleSignOut() {
    const auth = getClientAuth()
    if (auth) await signOut(auth)
    router.replace("/login")
  }

  if (!configured) {
    return (
      <Notice
        icon={ShieldAlertIcon}
        title="Firebase isn't configured"
        body="The NEXT_PUBLIC_FIREBASE_* settings are missing from .env.local. See .env.example."
      />
    )
  }
  if (loading || !user) return <FullPageSpinner />
  if (role === "client") {
    return (
      <Notice
        icon={SparklesIcon}
        title={`Welcome${user.displayName ? `, ${user.displayName}` : ""}`}
        body="Your AuraPixel client area is being set up. We'll let you know as soon as your leads and reports are ready to view here."
        action={
          <Button variant="outline" size="lg" onClick={handleSignOut}>
            Sign out
          </Button>
        }
      />
    )
  }
  if (role !== "admin") {
    return (
      <Notice
        icon={ShieldAlertIcon}
        title="This account can't use Ops"
        body={`Signed in as ${user.email ?? "unknown"}, which has no Ops access. Ask an AuraPixel admin to add you in Settings → Users.`}
        action={
          <Button variant="outline" size="lg" onClick={handleSignOut}>
            Sign out
          </Button>
        }
      />
    )
  }
  return <>{children}</>
}

export function FullPageSpinner() {
  return (
    <div
      className="flex min-h-svh items-center justify-center"
      role="status"
      aria-label="Loading"
    >
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  )
}

function Notice({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: typeof ShieldAlertIcon
  title: string
  body: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center page-x py-16 text-center">
      <Icon className="mb-4 size-10 text-muted-foreground" aria-hidden />
      <h1 className="font-heading text-xl font-semibold">{title}</h1>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{body}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}
