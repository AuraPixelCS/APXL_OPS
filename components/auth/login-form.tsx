"use client"

import { signInWithEmailAndPassword } from "firebase/auth"
import Image from "next/image"
import { useRouter, useSearchParams } from "next/navigation"
import * as React from "react"
import { useAuth } from "@/components/auth/auth-provider"
import { Brand } from "@/components/shell/brand"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  PasswordInput,
  PasswordInputGroup,
  PasswordInputInput,
  PasswordInputTrigger,
} from "@/components/ui/password-input"
import { getClientAuth } from "@/lib/firebase/client"
import auraLogo from "@/public/aurapixel-tight.png"

function mapError(code?: string): string {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Wrong email or password."
    case "auth/invalid-email":
      return "That doesn't look like a valid email."
    case "auth/configuration-not-found":
    case "auth/operation-not-allowed":
      return "Email sign-in isn't switched on for this Firebase project yet (Authentication → Sign-in method → Email/Password)."
    case "auth/user-disabled":
      return "This account is suspended. Ask an AuraPixel admin to restore it."
    case "auth/too-many-requests":
      return "Too many attempts. Wait a minute and try again."
    case "auth/network-request-failed":
      return "Network problem. Check your connection and try again."
    default:
      return "Sign-in failed. Try again."
  }
}

export function LoginForm() {
  const { loading, user } = useAuth()
  const router = useRouter()
  const next = useSearchParams().get("next")
  // Only follow in-app paths, never an outside URL smuggled into ?next=.
  const dest = next?.startsWith("/") && !next.startsWith("//") ? next : "/leads"

  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!loading && user) router.replace(dest)
  }, [loading, user, router, dest])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    const auth = getClientAuth()
    if (!auth) {
      setErr("Firebase isn't configured. See .env.example.")
      return
    }
    setBusy(true)
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password)
      router.replace(dest)
    } catch (e) {
      setErr(mapError((e as { code?: string })?.code))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-10">
        <div
          className="pointer-events-none absolute inset-0 brand-gradient"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 bg-black/35"
          aria-hidden
        />
        <div className="relative flex flex-1 items-center justify-center py-10">
          <Image
            src={auraLogo}
            alt="AuraPixel, Creative Media Studio"
            priority
            className="w-full max-w-md drop-shadow-[0_8px_32px_rgba(0,0,0,0.45)] xl:max-w-lg"
          />
        </div>
        <p className="relative text-sm text-white/80">
          Leads, conversations and day-to-day operations.
        </p>
      </aside>

      <div className="flex flex-col">
        <div className="flex h-14 items-center px-4 sm:px-6 lg:hidden">
          <Brand />
        </div>
        <div className="flex flex-1 items-center justify-center page-x py-10">
          <form
            onSubmit={onSubmit}
            className="flex w-full max-w-sm flex-col gap-5"
            noValidate
          >
            <div>
              <h1 className="font-heading text-2xl font-semibold tracking-tight">
                Sign in to Ops
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Use the account AuraPixel set up for you.
              </p>
            </div>

            {err && (
              <Alert variant="destructive">
                <AlertDescription>{err}</AlertDescription>
              </Alert>
            )}

            <Field>
              <FieldLabel>Email</FieldLabel>
              <Input
                type="email"
                autoComplete="email"
                inputMode="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                size="lg"
                className="h-11"
              />
            </Field>
            <Field>
              <FieldLabel>Password</FieldLabel>
              <PasswordInput size="lg">
                <PasswordInputGroup className="h-11">
                  <PasswordInputInput
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <PasswordInputTrigger aria-label="Show or hide password" />
                </PasswordInputGroup>
              </PasswordInput>
            </Field>

            <Button
              type="submit"
              size="xl"
              className="h-11 w-full"
              disabled={busy || !email || !password}
            >
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
