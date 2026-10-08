"use client"

// Live list of imported sheets (the `imports` collection), newest first, and
// the clients they belong to.

import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore"
import * as React from "react"
import { toDate } from "@/hooks/use-leads"
import { getClientDb } from "@/lib/firebase/client"
import { clientKeyOf, type Sheet } from "@/lib/leads/sheets"

export interface ClientSummary {
  client: string
  clientKey: string
  sheets: number
}

export function useSheets(): {
  data: Sheet[]
  clients: ClientSummary[]
  loading: boolean
  error: string | null
} {
  const [state, setState] = React.useState<{
    data: Sheet[]
    error: string | null
  } | null>(null)

  React.useEffect(() => {
    const db = getClientDb()
    if (!db) return
    const q = query(
      collection(db, "imports"),
      orderBy("createdAt", "desc"),
      limit(1000)
    )
    return onSnapshot(
      q,
      (snap) =>
        setState({
          data: snap.docs.map((d) => {
            const v = d.data()
            const client: string = v.client ?? ""
            return {
              id: d.id,
              title: v.title || v.fileName || "Untitled sheet",
              client,
              clientKey: v.clientKey ?? clientKeyOf(client),
              fileName: v.fileName ?? "",
              tabName: v.tabName ?? "",
              people: v.people ?? (v.created ?? 0) + (v.alreadyInOps ?? 0),
              created: v.created ?? 0,
              alreadyInOps: v.alreadyInOps ?? 0,
              duplicatesInFile: v.duplicatesInFile ?? 0,
              createdBy: v.createdBy ?? null,
              createdAt: toDate(v.createdAt),
            }
          }),
          error: null,
        }),
      (err) => setState({ data: [], error: err.message })
    )
  }, [])

  const data = React.useMemo(() => state?.data ?? [], [state])
  const clients = React.useMemo(() => {
    const byKey = new Map<string, ClientSummary>()
    for (const s of data) {
      if (!s.clientKey) continue
      const c = byKey.get(s.clientKey)
      if (c) c.sheets++
      else
        byKey.set(s.clientKey, {
          client: s.client,
          clientKey: s.clientKey,
          sheets: 1,
        })
    }
    return [...byKey.values()].sort((a, b) => a.client.localeCompare(b.client))
  }, [data])

  return { data, clients, loading: !state, error: state?.error ?? null }
}
