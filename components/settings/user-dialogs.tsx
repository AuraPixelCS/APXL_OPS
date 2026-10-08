"use client"

import {
  CheckIcon,
  CopyIcon,
  KeyRoundIcon,
  TriangleAlertIcon,
} from "lucide-react"
import * as React from "react"
import { DialogShell } from "@/components/common/dialog-shell"
import { FilterTabs } from "@/components/common/filter-tabs"
import { TextField } from "@/components/settings/form-bits"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldError,
  FieldHelper,
  FieldLabel,
} from "@/components/ui/field"
import {
  PasswordInput,
  PasswordInputGroup,
  PasswordInputInput,
  PasswordInputTrigger,
} from "@/components/ui/password-input"
import { Spinner } from "@/components/ui/spinner"
import { ApiError, apiPost } from "@/lib/api"
import { type AppRole, ROLE_LABEL } from "@/lib/roles"
import {
  MIN_PASSWORD,
  type OpsUser,
  passwordProblem,
  signInDetails,
} from "@/lib/users"

export type PasswordMode = "generate" | "type"

function PasswordField({
  label,
  value,
  onChange,
  error,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  error?: string
}) {
  return (
    <Field invalid={Boolean(error)}>
      <FieldLabel>{label}</FieldLabel>
      <PasswordInput size="lg">
        <PasswordInputGroup className="h-10">
          <PasswordInputInput
            autoComplete="new-password"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          <PasswordInputTrigger aria-label="Show or hide password" />
        </PasswordInputGroup>
      </PasswordInput>
      {!error && <FieldHelper>At least {MIN_PASSWORD} characters.</FieldHelper>}
      <FieldError>{error}</FieldError>
    </Field>
  )
}

function PasswordChoice({
  mode,
  onMode,
  password,
  onPassword,
  error,
}: {
  mode: PasswordMode
  onMode: (m: PasswordMode) => void
  password: string
  onPassword: (v: string) => void
  error?: string
}) {
  return (
    <div className="flex flex-col gap-3">
      <FilterTabs<PasswordMode>
        value={mode}
        onChange={onMode}
        label="Password"
        options={[
          { value: "generate", label: "Generate a password" },
          { value: "type", label: "Type one" },
        ]}
      />
      {mode === "generate" ? (
        <p className="text-sm text-muted-foreground">
          We&rsquo;ll create a strong password and show it to you once, ready to
          copy and send.
        </p>
      ) : (
        <PasswordField
          label="Password"
          value={password}
          onChange={onPassword}
          error={error}
        />
      )}
    </div>
  )
}

// ── Add or edit ────────────────────────────────────────────────────────────

export function UserFormDialog({
  open,
  onClose,
  user,
  isSelf,
  onCreated,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  /** Missing = add a new account. */
  user?: OpsUser
  isSelf?: boolean
  onCreated: (
    user: OpsUser,
    password: string | null,
    typedPassword: string
  ) => void
  onSaved: (user: OpsUser) => void
}) {
  const editing = Boolean(user)
  const [role, setRole] = React.useState<AppRole>(user?.role ?? "client")
  const [name, setName] = React.useState(user?.name ?? "")
  const [email, setEmail] = React.useState(user?.email ?? "")
  const [company, setCompany] = React.useState(user?.company ?? "")
  const [mode, setMode] = React.useState<PasswordMode>("generate")
  const [password, setPassword] = React.useState("")
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [formError, setFormError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  async function submit() {
    setErrors({})
    setFormError(null)
    if (!editing && mode === "type") {
      const p = passwordProblem(password)
      if (p) return setErrors({ password: p })
    }
    setBusy(true)
    try {
      if (editing && user) {
        const res = await apiPost<{ user: OpsUser }>("/api/users/update", {
          uid: user.uid,
          name,
          company,
          ...(!isSelf && { role }),
        })
        onSaved(res.user)
      } else {
        const typed = mode === "type" ? password : ""
        const res = await apiPost<{ user: OpsUser; password: string | null }>(
          "/api/users/create",
          {
            email,
            name,
            role,
            company,
            password: typed,
          }
        )
        onCreated(res.user, res.password, typed)
      }
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.fields).length)
        setErrors(e.fields)
      setFormError(e instanceof Error ? e.message : "Something went wrong.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${user?.name || user?.email}` : "Add a user"}
      description={
        editing
          ? undefined
          : "Admins can use everything in Ops. Clients sign in to their own area and never see other clients."
      }
      footer={
        <>
          <Button variant="outline" size="lg" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button size="lg" onClick={submit} disabled={busy}>
            {busy && <Spinner />}
            {editing ? "Save" : role === "admin" ? "Add admin" : "Add client"}
          </Button>
        </>
      }
    >
      {formError && Object.keys(errors).length === 0 && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Role</span>
        <FilterTabs<AppRole>
          value={role}
          onChange={setRole}
          label="Role"
          options={[
            { value: "client", label: ROLE_LABEL.client },
            { value: "admin", label: ROLE_LABEL.admin },
          ]}
          className={isSelf ? "pointer-events-none opacity-60" : undefined}
        />
        {isSelf && (
          <p className="text-xs text-muted-foreground">
            You can&rsquo;t change your own role.
          </p>
        )}
      </div>
      <TextField
        label="Name"
        value={name}
        onChange={setName}
        error={errors.name}
      />
      {editing ? (
        <div className="text-sm">
          <p className="font-medium">Email</p>
          <p className="text-muted-foreground">
            {user?.email} (sign-in emails can&rsquo;t be changed here)
          </p>
        </div>
      ) : (
        <TextField
          label="Email"
          type="email"
          inputMode="email"
          value={email}
          onChange={setEmail}
          error={errors.email}
        />
      )}
      {role === "client" && (
        <TextField
          label="Business"
          value={company}
          onChange={setCompany}
          error={errors.company}
          helper="The client's company, e.g. Kedai Kopi Sdn Bhd."
        />
      )}
      {!editing && (
        <PasswordChoice
          mode={mode}
          onMode={setMode}
          password={password}
          onPassword={setPassword}
          error={errors.password}
        />
      )}
    </DialogShell>
  )
}

// ── Set a new password ─────────────────────────────────────────────────────

export function PasswordDialog({
  open,
  onClose,
  user,
  isSelf,
  onDone,
}: {
  open: boolean
  onClose: () => void
  user: OpsUser
  isSelf: boolean
  onDone: (generated: string | null, typed: string) => void
}) {
  const [mode, setMode] = React.useState<PasswordMode>("generate")
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState<string | undefined>()
  const [formError, setFormError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  async function submit() {
    setError(undefined)
    setFormError(null)
    const typed = mode === "type" ? password : ""
    if (typed) {
      const p = passwordProblem(typed)
      if (p) return setError(p)
    }
    setBusy(true)
    try {
      const res = await apiPost<{ password: string | null }>(
        "/api/users/set-password",
        {
          uid: user.uid,
          password: typed,
        }
      )
      onDone(res.password, typed)
    } catch (e) {
      if (e instanceof ApiError && e.fields.password)
        setError(e.fields.password)
      else
        setFormError(
          e instanceof Error ? e.message : "Couldn't change the password."
        )
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title={`New password for ${user.name || user.email}`}
      description={
        isSelf
          ? "Your other devices will need the new password."
          : "Their current password stops working and they're signed out everywhere."
      }
      footer={
        <>
          <Button variant="outline" size="lg" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button size="lg" onClick={submit} disabled={busy}>
            {busy ? <Spinner /> : <KeyRoundIcon />}
            Set password
          </Button>
        </>
      }
    >
      {formError && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <PasswordChoice
        mode={mode}
        onMode={setMode}
        password={password}
        onPassword={setPassword}
        error={error}
      />
    </DialogShell>
  )
}

// ── Show a login once ──────────────────────────────────────────────────────

function CopyRow({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  const [copied, setCopied] = React.useState(false)
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-background/60 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={mono ? "font-mono text-sm break-all" : "text-sm break-all"}
        >
          {value}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon-xl"
        aria-label={`Copy ${label.toLowerCase()}`}
        onClick={async () => {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </Button>
    </div>
  )
}

export function CredentialsDialog({
  open,
  onClose,
  email,
  password,
  loginUrl,
  title,
}: {
  open: boolean
  onClose: () => void
  email: string
  password: string
  loginUrl: string
  title: string
}) {
  const [copied, setCopied] = React.useState(false)
  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title={title}
      description="Send these to them now. The password is shown only this once."
      footer={
        <>
          <Button
            variant="outline"
            size="lg"
            onClick={async () => {
              await navigator.clipboard.writeText(
                signInDetails(email, password, loginUrl)
              )
              setCopied(true)
            }}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? "Copied" : "Copy all"}
          </Button>
          <Button size="lg" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      <CopyRow label="Login page" value={loginUrl} />
      <CopyRow label="Email" value={email} />
      <CopyRow label="Password" value={password} mono />
    </DialogShell>
  )
}

// ── Confirm a risky action ─────────────────────────────────────────────────
