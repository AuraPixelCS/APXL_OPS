import type { Metadata } from "next"
import { SettingsPage } from "@/components/settings/settings-page"

export const metadata: Metadata = { title: "Settings" }

// Rendered only after the client-side auth gate resolves; see (app)/layout.tsx.
export const instant = false

export default function Page() {
  return <SettingsPage />
}
