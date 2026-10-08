import type { Metadata } from "next"
import { ImportPage } from "@/components/sheets/import-page"

export const metadata: Metadata = { title: "Import a sheet" }

// Rendered only after the client-side auth gate resolves; see (app)/layout.tsx.
export const instant = false

export default function Page() {
  return <ImportPage />
}
