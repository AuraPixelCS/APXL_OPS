import type { Metadata } from "next"
import { LeadsPage } from "@/components/leads/leads-page"

export const metadata: Metadata = { title: "Leads" }

// Rendered only after the client-side auth gate resolves; see (app)/layout.tsx.
export const instant = false

export default function Page() {
  return <LeadsPage />
}
