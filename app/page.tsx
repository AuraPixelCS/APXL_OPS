import { redirect } from "next/navigation"

// Leads is the only section so far; the dashboard comes later.
export default function Home() {
  redirect("/leads")
}
