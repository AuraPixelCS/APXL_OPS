import type { Metadata } from "next"
import { Suspense } from "react"
import { FullPageSpinner } from "@/components/auth/auth-gate"
import { LeadDetailPage } from "@/components/leads/lead-detail-page"

export const metadata: Metadata = { title: "Lead" }

// Rendered only after the client-side auth gate resolves; see (app)/layout.tsx.
export const instant = false

// The lead id is only known at request time, so useParams suspends here.
export default function Page() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <LeadDetailPage />
    </Suspense>
  )
}
