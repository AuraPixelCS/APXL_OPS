"use client"

// Live views for email blasts: the list, one blast, who it has been sent to,
// who unsubscribed, and the leads in its sheets (its audience).

import {
  collection,
  doc,
  type DocumentData,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore"
import * as React from "react"
import { toDate, toLead } from "@/hooks/use-leads"
import { type BlastEmail, defaultBlastEmail } from "@/lib/blasts/email"
import type { AudienceLead } from "@/lib/blasts/recipients"
import {
  type Blast,
  type BlastList,
  type BlastRecipient,
  MAX_BLAST_SHEETS,
} from "@/lib/blasts/types"
import { getClientDb } from "@/lib/firebase/client"
import type { Lead } from "@/lib/leads/types"

const EMPTY_EMAIL: BlastEmail = defaultBlastEmail({
  senderName: "",
  address: "",
  signature: "",
})

export function toBlast(id: string, d: DocumentData): Blast {
  return {
    id,
    name: d.name ?? "Untitled blast",
    sheetIds: Array.isArray(d.sheetIds) ? d.sheetIds : [],
    listIds: Array.isArray(d.listIds) ? d.listIds : [],
    email: { ...EMPTY_EMAIL, ...(d.email ?? {}) },
    sentCount: d.sentCount ?? 0,
    lastSentAt: toDate(d.lastSentAt),
    lastReport: d.lastReport
      ? {
          to: Array.isArray(d.lastReport.to) ? d.lastReport.to : [],
          sentAt: toDate(d.lastReport.sentAt),
          by: d.lastReport.by ?? "",
        }
      : null,
    createdBy: d.createdBy ?? null,
    createdAt: toDate(d.createdAt),
    updatedBy: d.updatedBy ?? null,
    updatedAt: toDate(d.updatedAt),
  }
}

export type Live<T> = { data: T; loading: boolean; error: string | null }

/** Subscribes while `key` stays the same; `key` null = nothing to load. */
export function useLive<T>(
  key: string | null,
  empty: T,
  subscribe: (
    set: (data: T) => void,
    fail: (msg: string) => void
  ) => (() => void) | undefined
): Live<T> {
  const [state, setState] = React.useState<{
    key: string
    data: T
    error: string | null
  } | null>(null)
  const sub = React.useRef(subscribe)
  React.useEffect(() => {
    sub.current = subscribe
  })
  React.useEffect(() => {
    if (key === null) return
    return sub.current(
      (data) => setState({ key, data, error: null }),
      (msg) => setState({ key, data: empty, error: msg })
    )
    // `empty` is a constant per call site
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const current = key !== null && state?.key === key ? state : null
  return {
    data: current?.data ?? empty,
    loading: key !== null && !current,
    error: current?.error ?? null,
  }
}

const NO_BLASTS: Blast[] = []
export function useBlasts(): Live<Blast[]> {
  return useLive("blasts", NO_BLASTS, (set, fail) => {
    const db = getClientDb()
    if (!db) return
    return onSnapshot(
      query(collection(db, "blasts"), orderBy("createdAt", "desc"), limit(500)),
      (snap) => set(snap.docs.map((d) => toBlast(d.id, d.data()))),
      (err) => fail(err.message)
    )
  })
}

export function useBlast(id: string): Live<Blast | null> {
  return useLive<Blast | null>(id ? `blast:${id}` : null, null, (set, fail) => {
    const db = getClientDb()
    if (!db) return
    return onSnapshot(
      doc(db, "blasts", id),
      (snap) => set(snap.exists() ? toBlast(snap.id, snap.data()) : null),
      (err) => fail(err.message)
    )
  })
}

const NO_RECIPIENTS = new Map<string, BlastRecipient>()
/** Everyone this blast has been sent to (or tried), by address. */
export function useRecipients(
  blastId: string
): Live<Map<string, BlastRecipient>> {
  return useLive(
    blastId ? `rec:${blastId}` : null,
    NO_RECIPIENTS,
    (set, fail) => {
      const db = getClientDb()
      if (!db) return
      return onSnapshot(
        collection(db, "blasts", blastId, "recipients"),
        (snap) =>
          set(
            new Map(
              snap.docs.map((d) => {
                const v = d.data()
                return [
                  d.id,
                  {
                    email: v.email ?? d.id,
                    leadId: v.leadId ?? "",
                    name: v.name ?? "",
                    status: v.status ?? "failed",
                    error: v.error ?? null,
                    sentAt: toDate(v.sentAt),
                    sentBy: v.sentBy ?? null,
                    attemptAt: toDate(v.attemptAt),
                    unsubscribedAt: toDate(v.unsubscribedAt),
                  },
                ]
              })
            )
          ),
        (err) => fail(err.message)
      )
    }
  )
}

const NO_UNSUBS = new Set<string>()
/** Addresses that opted out of every blast. */
export function useUnsubscribes(): Live<Set<string>> {
  return useLive("unsubscribes", NO_UNSUBS, (set, fail) => {
    const db = getClientDb()
    if (!db) return
    return onSnapshot(
      collection(db, "unsubscribes"),
      (snap) => set(new Set(snap.docs.map((d) => d.id))),
      (err) => fail(err.message)
    )
  })
}

const NO_LEADS: Lead[] = []
/** Every lead in any of these sheets. */
export function useSheetLeads(sheetIds: string[]): Live<Lead[]> {
  const ids = [...new Set(sheetIds)].sort().slice(0, MAX_BLAST_SHEETS)
  return useLive(
    ids.length ? `leads:${ids.join(",")}` : null,
    NO_LEADS,
    (set, fail) => {
      const db = getClientDb()
      if (!db) return
      return onSnapshot(
        query(
          collection(db, "leads"),
          where("sheetIds", "array-contains-any", ids)
        ),
        (snap) => set(snap.docs.map((d) => toLead(d.id, d.data()))),
        (err) => fail(err.message)
      )
    }
  )
}

const NO_LISTS: BlastList[] = []
/** Files uploaded just for this blast. */
export function useBlastLists(blastId: string): Live<BlastList[]> {
  return useLive(blastId ? `lists:${blastId}` : null, NO_LISTS, (set, fail) => {
    const db = getClientDb()
    if (!db) return
    return onSnapshot(
      query(collection(db, "blastLists"), where("blastId", "==", blastId)),
      (snap) =>
        set(
          snap.docs.map((d) => {
            const v = d.data()
            return {
              id: d.id,
              blastId: v.blastId ?? blastId,
              name: v.name ?? v.fileName ?? "Uploaded list",
              fileName: v.fileName ?? "",
              people: v.people ?? 0,
              canEmail: v.canEmail ?? 0,
              manual: Boolean(v.manual),
              createdAt: toDate(v.createdAt),
            }
          })
        ),
      (err) => fail(err.message)
    )
  })
}

const NO_CONTACTS: AudienceLead[] = []
/**
 * The people in a blast's uploaded files, shaped like leads so the recipient
 * list treats them the same. `sheetIds` holds the file's id, so the "sheet"
 * filter and labels work for files too.
 */
export function useListContacts(listIds: string[]): Live<AudienceLead[]> {
  const ids = [...new Set(listIds)].sort()
  return useLive(
    ids.length ? `contacts:${ids.join(",")}` : null,
    NO_CONTACTS,
    (set, fail) => {
      const db = getClientDb()
      if (!db) return
      const parts = new Map<string, AudienceLead[]>()
      const stops = ids.map((listId) =>
        onSnapshot(
          collection(db, "blastLists", listId, "contacts"),
          (snap) => {
            parts.set(
              listId,
              snap.docs.map((d) => {
                const v = d.data()
                // File order, so "the first 100" means the file's first 100.
                const at =
                  (toDate(v.createdAt)?.getTime() ?? 0) + (v.order ?? 0)
                return {
                  id: `list:${listId}:${d.id}`,
                  email: v.email ?? "",
                  emailOk: Boolean(v.emailOk),
                  name: v.name ?? "",
                  greetingName: v.greetingName ?? "there",
                  sheetIds: [listId],
                  client: "",
                  createdAt: new Date(at),
                }
              })
            )
            if (parts.size === ids.length)
              set(ids.flatMap((i) => parts.get(i) ?? []))
          },
          (err) => fail(err.message)
        )
      )
      return () => stops.forEach((stop) => stop())
    }
  )
}
