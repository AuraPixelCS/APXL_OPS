import type { Metadata } from "next"
import { Suspense } from "react"
import { UnsubscribePage } from "@/components/blasts/unsubscribe-page"

export const metadata: Metadata = {
  title: "Unsubscribe",
  robots: { index: false, follow: false },
}

// PUBLIC (outside the signed-in group): people land here from the Unsubscribe
// link in a blast. It reads ?b=&e=&t= with useSearchParams, hence Suspense.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <UnsubscribePage />
    </Suspense>
  )
}
