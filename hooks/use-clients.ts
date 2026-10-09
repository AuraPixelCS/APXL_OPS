"use client"

// Live list of clients (Settings → Clients), by name. The docs hold sender
// details and Resend status only; keys stay server side.

import { collection, onSnapshot } from "firebase/firestore"
import { toDate } from "@/hooks/use-leads"
import { type Live, useLive } from "@/hooks/use-blasts"
import { type ClientProfile, NO_RESEND } from "@/lib/clients"
import { getClientDb } from "@/lib/firebase/client"

const NO_CLIENTS: ClientProfile[] = []

export function useClients(): Live<ClientProfile[]> {
  return useLive("clients", NO_CLIENTS, (set, fail) => {
    const db = getClientDb()
    if (!db) return
    return onSnapshot(
      collection(db, "clients"),
      (snap) =>
        set(
          snap.docs
            .map((d): ClientProfile => {
              const v = d.data()
              const r = v.resend ?? {}
              return {
                id: d.id,
                name: v.name ?? "Client",
                fromName: v.fromName ?? "",
                fromEmail: v.fromEmail ?? "",
                replyTo: v.replyTo ?? "",
                footer: v.footer ?? "",
                resend: {
                  ...NO_RESEND,
                  connected: Boolean(r.connected),
                  last4: r.last4 ?? "",
                  domains: Array.isArray(r.domains) ? r.domains : [],
                  restricted: Boolean(r.restricted),
                  checkedAt: toDate(r.checkedAt),
                },
                updatedAt: toDate(v.updatedAt),
                updatedBy: v.updatedBy ?? null,
              }
            })
            .sort((a, b) => a.name.localeCompare(b.name))
        ),
      (err) => fail(err.message)
    )
  })
}
