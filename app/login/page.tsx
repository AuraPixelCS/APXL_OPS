import type { Metadata } from "next"
import { Suspense } from "react"
import { LoginForm } from "@/components/auth/login-form"

export const metadata: Metadata = { title: "Sign in" }

// LoginForm reads ?next= with useSearchParams, which needs a Suspense boundary
// so the static shell can prerender.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
