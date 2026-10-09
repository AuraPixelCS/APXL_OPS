import type { Metadata } from "next"
import { Suspense } from "react"
import { FullPageSpinner } from "@/components/auth/auth-gate"
import { BlastPage } from "@/components/blasts/blast-page"

export const metadata: Metadata = { title: "Email blast" }

// Rendered only after the client-side auth gate resolves; see (app)/layout.tsx.
export const instant = false

// The blast id (and ?tab=) are only known at request time, so this suspends.
export default function Page() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <BlastPage />
    </Suspense>
  )
}
