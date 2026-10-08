"use client"

// Form state for one settings section. Keeps only the user's EDITS on top of
// the live saved values, so a save from another tab (or n8n) flows in without
// an effect, and "Discard" is just clearing the edits.

import * as React from "react"
import { toast } from "@/components/ui/toast"
import { useSettings } from "@/hooks/use-settings"
import { ApiError, apiPost } from "@/lib/api"
import {
  type SettingsMap,
  type SettingsSection,
  validateSettings,
} from "@/lib/settings"

export function useSettingsForm<S extends SettingsSection>(
  section: S,
  title: string
) {
  const remote = useSettings(section)
  const [edits, setEdits] = React.useState<Partial<SettingsMap[S]>>({})
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [saving, setSaving] = React.useState(false)

  const values = { ...remote.values, ...edits } as SettingsMap[S]
  const dirty = (Object.keys(edits) as (keyof SettingsMap[S])[]).some(
    (k) => edits[k] !== remote.values[k]
  )

  function set<K extends keyof SettingsMap[S]>(
    key: K,
    value: SettingsMap[S][K]
  ) {
    setEdits((e) => ({ ...e, [key]: value }))
    setErrors((e) => {
      if (!e[key as string]) return e
      const next = { ...e }
      delete next[key as string]
      return next
    })
  }

  function discard() {
    setEdits({})
    setErrors({})
  }

  async function save() {
    const checked = validateSettings(section, values)
    if (!checked.ok) {
      setErrors(checked.errors as Record<string, string>)
      toast.error({
        title: "Some fields need fixing",
        description: "Check the highlighted fields.",
      })
      return
    }
    setSaving(true)
    try {
      await apiPost("/api/settings", { section, values: checked.values })
      setEdits({})
      setErrors({})
      toast.success({ title: `${title} saved` })
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.fields).length > 0)
        setErrors(e.fields)
      toast.error({
        title: "Couldn't save",
        description: e instanceof Error ? e.message : undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  return { remote, values, set, errors, dirty, saving, save, discard }
}
