"use client"

// The blast email being edited: the user's EDITS on top of the saved email
// (same idea as Settings), so a save from another tab flows in without an
// effect. Lives on the blast page, so switching tabs keeps unsaved edits, and
// the Recipients tab can tell whether the saved email is ready to send.

import * as React from "react"
import { toast } from "@/components/ui/toast"
import { ApiError, apiPost } from "@/lib/api"
import {
  type BlastEmail,
  type BlastEmailField,
  validateBlastEmail,
} from "@/lib/blasts/email"
import type { Blast } from "@/lib/blasts/types"

type Errors = Partial<Record<BlastEmailField, string>>

export function useBlastEmailForm(blast: Blast | null) {
  const [edits, setEdits] = React.useState<{
    id: string
    values: Partial<BlastEmail>
  }>({ id: "", values: {} })
  const [errors, setErrors] = React.useState<Errors>({})
  const [saving, setSaving] = React.useState(false)

  const mine = blast && edits.id === blast.id ? edits.values : {}
  const saved = blast?.email
  const values = { ...saved, ...mine } as BlastEmail
  const dirty =
    !!saved &&
    (Object.keys(mine) as BlastEmailField[]).some((k) => mine[k] !== saved[k])

  function set<K extends BlastEmailField>(key: K, value: BlastEmail[K]) {
    if (!blast) return
    setEdits((e) => ({
      id: blast.id,
      values: { ...(e.id === blast.id ? e.values : {}), [key]: value },
    }))
    setErrors((e) => {
      if (!e[key]) return e
      const next = { ...e }
      delete next[key]
      return next
    })
  }

  function discard() {
    setEdits({ id: "", values: {} })
    setErrors({})
  }

  async function save(): Promise<boolean> {
    if (!blast) return false
    const checked = validateBlastEmail(values)
    if (!checked.ok) {
      setErrors(checked.errors)
      toast.error({
        title: "Some fields need fixing",
        description: "Check the highlighted fields.",
      })
      return false
    }
    setSaving(true)
    try {
      await apiPost("/api/blasts/update", {
        id: blast.id,
        email: checked.email,
      })
      setEdits({ id: "", values: {} })
      setErrors({})
      toast.success({ title: "Email saved" })
      return true
    } catch (e) {
      if (e instanceof ApiError) setErrors(e.fields as Errors)
      toast.error({
        title: "Couldn't save",
        description: e instanceof Error ? e.message : undefined,
      })
      return false
    } finally {
      setSaving(false)
    }
  }

  /** What a real send would still need, for the SAVED email. */
  const savedProblems = React.useMemo(() => {
    if (!saved) return {}
    const r = validateBlastEmail(saved, { sending: true })
    return r.ok ? {} : r.errors
  }, [saved])

  return {
    values,
    dirty,
    errors,
    setErrors,
    set,
    discard,
    save,
    saving,
    /** The saved email can be sent as it is. */
    readyToSend: !!saved && Object.keys(savedProblems).length === 0,
    savedProblems,
  }
}

export type BlastEmailForm = ReturnType<typeof useBlastEmailForm>
