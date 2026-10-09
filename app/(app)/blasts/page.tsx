import type { Metadata } from "next"
import { BlastsPage } from "@/components/blasts/blasts-page"

export const metadata: Metadata = { title: "Email blasts" }

// Rendered only after the client-side auth gate resolves; see (app)/layout.tsx.
export const instant = false

export default function Page() {
  return <BlastsPage />
}
