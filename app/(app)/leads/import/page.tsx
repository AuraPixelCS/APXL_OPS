import type { Metadata } from "next"
import { ImportPage } from "@/components/leads/import-page"

export const metadata: Metadata = { title: "Import CSV" }

// Rendered only after the client-side auth gate resolves; see (app)/layout.tsx.
export const instant = false

export default function Page() {
  return <ImportPage />
}
