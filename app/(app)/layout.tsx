import { Suspense } from "react"
import { AuthGate, FullPageSpinner } from "@/components/auth/auth-gate"

// Everything behind sign-in. The gate waits for Firebase Auth, which only
// resolves in the browser, so the pages under it never render during
// prerendering. Next's instant-navigation check then reports each page as a
// "dropped segment"; the opt-out has to sit on the PAGE itself, so every page
// in this group exports `instant = false` (a layout-level one doesn't count).
//
// The gate also reads usePathname, which suspends on routes with request-time
// params (/leads/[id]) under Cache Components, hence the boundary.
export default function SignedInLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <AuthGate>{children}</AuthGate>
    </Suspense>
  )
}
