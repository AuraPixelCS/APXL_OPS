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
} from "firebase/firestore"
import * as React from "react"
import { getClientDb } from "@/lib/firebase/client"
import type { Lead } from "@/lib/leads/types"

const LIST_LIMIT = 1000

function toDate(v: unknown): Date | null {
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
    source: d.source ?? { type: "csv", fileName: "", importId: "" },
    createdAt: toDate(d.createdAt),
    updatedAt: toDate(d.updatedAt),
    lastActivityAt: toDate(d.lastActivityAt),
  }
}

type State<T> = { data: T; loading: boolean; error: string | null }

export function useLeads(): State<Lead[]> {
  const [state, setState] = React.useState<State<Lead[]>>({
    data: [],
    loading: true,
    error: null,
  })
  React.useEffect(() => {
    const db = getClientDb()
    if (!db) return
    const q = query(
      collection(db, "leads"),
      orderBy("createdAt", "desc"),
      limit(LIST_LIMIT)
    )
    return onSnapshot(
      q,
      (snap) =>
        setState({
          data: snap.docs.map((d) => toLead(d.id, d.data())),
          loading: false,
          error: null,
        }),
      (err) => setState((s) => ({ ...s, loading: false, error: err.message }))
    )
  }, [])
  return state
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
