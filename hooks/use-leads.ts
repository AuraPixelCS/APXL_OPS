"use client"

// Live views of leads in Firestore. Reads go straight from the browser (the
// security rules allow admins only), so anything the server or n8n writes
// shows up without a refresh.

import {
  collection,
  doc,
  type DocumentData,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore"
import * as React from "react"
import { getClientDb } from "@/lib/firebase/client"
import type { Lead } from "@/lib/leads/types"

export function toDate(v: unknown): Date | null {
  return v instanceof Timestamp ? v.toDate() : null
}

export function toLead(id: string, d: DocumentData): Lead {
  return {
    id,
    name: d.name ?? "",
    greetingName: d.greetingName ?? "there",
    email: d.email ?? "",
    emailOk: Boolean(d.emailOk),
    workEmail: Boolean(d.workEmail),
    phone: d.phone ?? "",
    whatsappOk: Boolean(d.whatsappOk),
    flags: Array.isArray(d.flags) ? d.flags : [],
    extra: d.extra ?? {},
    status: d.status ?? "new",
    score: d.score ?? null,
    scoreReason: d.scoreReason ?? null,
    summary: d.summary ?? null,
    client: d.client ?? "",
    clientKey: d.clientKey ?? "",
    sheetIds: Array.isArray(d.sheetIds) ? d.sheetIds : [],
    source: d.source ?? { type: "csv", fileName: "", importId: "" },
    createdAt: toDate(d.createdAt),
    updatedAt: toDate(d.updatedAt),
    lastActivityAt: toDate(d.lastActivityAt),
  }
}

type State<T> = { data: T; loading: boolean; error: string | null }

/** Narrow the list to one client's leads, or one sheet's. */
export interface LeadScope {
  clientKey?: string
  sheetId?: string
}

export const LIST_LIMIT = 1000
// A sheet holds at most MAX_IMPORT_ROWS people; a client a few of those.
const SCOPED_LIMIT = 5000

const newestFirst = (a: Lead, b: Lead) =>
  (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)

/**
 * The lead list. Unscoped, it's the newest LIST_LIMIT (`capped` says when there
 * are probably more). Scoped queries use single-field filters only, so they
 * need no composite index; they're sorted here instead.
 */
export function useLeads({ clientKey, sheetId }: LeadScope = {}): State<
  Lead[]
> & { capped: boolean } {
  const key = sheetId
    ? `sheet:${sheetId}`
    : clientKey
      ? `client:${clientKey}`
      : "all"
  const [state, setState] = React.useState<{
    key: string
    data: Lead[]
    error: string | null
  } | null>(null)

  React.useEffect(() => {
    const db = getClientDb()
    if (!db) return
    const leads = collection(db, "leads")
    const q = sheetId
      ? query(
          leads,
          where("sheetIds", "array-contains", sheetId),
          limit(SCOPED_LIMIT)
        )
      : clientKey
        ? query(leads, where("clientKey", "==", clientKey), limit(SCOPED_LIMIT))
        : query(leads, orderBy("createdAt", "desc"), limit(LIST_LIMIT))
    const k = sheetId
      ? `sheet:${sheetId}`
      : clientKey
        ? `client:${clientKey}`
        : "all"
    return onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map((d) => toLead(d.id, d.data()))
        if (k !== "all") data.sort(newestFirst)
        setState({ key: k, data, error: null })
      },
      (err) => setState({ key: k, data: [], error: err.message })
    )
  }, [clientKey, sheetId])

  // Until the new scope's first snapshot arrives, show loading rather than
  // the previous scope's rows.
  const current = state?.key === key ? state : null
  return {
    data: current?.data ?? [],
    loading: !current,
    error: current?.error ?? null,
    capped: key === "all" && (current?.data.length ?? 0) >= LIST_LIMIT,
  }
}

export function useLead(id: string): State<Lead | null> {
  const [state, setState] = React.useState<State<Lead | null>>({
    data: null,
    loading: true,
    error: null,
  })
  React.useEffect(() => {
    const db = getClientDb()
    if (!db || !id) return
    return onSnapshot(
      doc(db, "leads", id),
      (snap) =>
        setState({
          data: snap.exists() ? toLead(snap.id, snap.data()) : null,
          loading: false,
          error: null,
        }),
      (err) => setState({ data: null, loading: false, error: err.message })
    )
  }, [id])
  return state
}
