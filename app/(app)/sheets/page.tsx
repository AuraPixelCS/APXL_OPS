import type { Metadata } from "next"
import { SheetsPage } from "@/components/sheets/sheets-page"

export const metadata: Metadata = { title: "Sheets" }

// Rendered only after the client-side auth gate resolves; see (app)/layout.tsx.
export const instant = false

export default function Page() {
  return <SheetsPage />
}
