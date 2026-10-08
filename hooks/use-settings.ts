"use client"

// Live view of one settings section, merged over the defaults so the form
// always has every field even before anything has been saved.

import { doc, onSnapshot, Timestamp } from "firebase/firestore"
import * as React from "react"
import { getClientDb } from "@/lib/firebase/client"
import {
  DEFAULT_SETTINGS,
  type SettingsMap,
  type SettingsSection,
} from "@/lib/settings"

export interface SettingsState<S extends SettingsSection> {
  values: SettingsMap[S]
  /** False until this section has been saved at least once. */
  saved: boolean
  updatedAt: Date | null
  updatedBy: string | null
  loading: boolean
  error: string | null
}

export function useSettings<S extends SettingsSection>(
  section: S
): SettingsState<S> {
  const [state, setState] = React.useState<SettingsState<S>>({
    values: DEFAULT_SETTINGS[section],
    saved: false,
    updatedAt: null,
    updatedBy: null,
    loading: true,
    error: null,
  })
  React.useEffect(() => {
    const db = getClientDb()
    if (!db) return
    return onSnapshot(
      doc(db, "settings", section),
      (snap) => {
        const data = snap.data()
        const defaults = DEFAULT_SETTINGS[section] as unknown as Record<
          string,
          string
        >
        const values = Object.fromEntries(
          Object.entries(defaults).map(([k, v]) => [
            k,
            typeof data?.[k] === "string" ? data[k] : v,
          ])
        ) as unknown as SettingsMap[S]
        setState({
          values,
          saved: snap.exists(),
          updatedAt:
            data?.updatedAt instanceof Timestamp
              ? data.updatedAt.toDate()
              : null,
          updatedBy:
            typeof data?.updatedBy === "string" ? data.updatedBy : null,
          loading: false,
          error: null,
        })
      },
      (err) => setState((s) => ({ ...s, loading: false, error: err.message }))
    )
  }, [section])
  return state
}
