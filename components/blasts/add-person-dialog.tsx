"use client"

// Add people to a blast one at a time (no file). They're kept in the blast's
// "Added by hand" list, shown here so a typo can be taken off again.

import { Trash2Icon, UserPlusIcon } from "lucide-react"
import * as React from "react"
import { DialogShell } from "@/components/common/dialog-shell"
import { TextField } from "@/components/settings/form-bits"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { useListContacts } from "@/hooks/use-blasts"
import { ApiError, apiPost } from "@/lib/api"
import { type Blast, HAND_LIST_NAME, handListId } from "@/lib/blasts/types"

export function AddPersonDialog({
  blast,
  onClose,
}: {
  blast: Blast
  onClose: () => void
}) {
  const listId = handListId(blast.id)
  const { data: added } = useListContacts(
    blast.listIds.includes(listId) ? [listId] : []
  )
  const [email, setEmail] = React.useState("")
  const [name, setName] = React.useState("")
  const [error, setError] = React.useState<string>()
  const [busy, setBusy] = React.useState(false)
  const [removing, setRemoving] = React.useState<string | null>(null)
  const newestFirst = [...added].sort(
    (a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0)
  )

  async function add() {
    if (!email.trim()) {
      setError("Enter an email address.")
      return
    }
    const sent = { email, name }
    setBusy(true)
    setError(undefined)
    try {
      const r = await apiPost<{ email: string; unsubscribed: boolean }>(
        "/api/blasts/people/add",
        { blastId: blast.id, ...sent }
      )
      toast.success({
        title: `Added ${r.email}`,
        description: r.unsubscribed
          ? "They unsubscribed earlier, so they won’t be emailed."
          : undefined,
      })
      // Clear only what was added: the next address may already be typed.
      setEmail((v) => (v === sent.email ? "" : v))
      setName((v) => (v === sent.name ? "" : v))
    } catch (e) {
      setError(
        e instanceof ApiError
          ? (e.fields.email ?? e.message)
          : "They weren’t added. Try again."
      )
    } finally {
      setBusy(false)
    }
  }

  async function remove(address: string) {
    setRemoving(address)
    try {
      await apiPost("/api/blasts/people/remove", {
        blastId: blast.id,
        email: address,
      })
    } catch (e) {
      toast.error({
        title: "Couldn’t remove them",
        description: e instanceof Error ? e.message : undefined,
      })
    } finally {
      setRemoving(null)
    }
  }

  return (
    <DialogShell
      open
      onClose={onClose}
      title="Add a person"
      footer={
        <>
          <Button variant="outline" size="xl" onClick={onClose} disabled={busy}>
            Done
          </Button>
          <Button size="xl" onClick={() => void add()} disabled={busy}>
            {busy ? <Spinner /> : <UserPlusIcon />}
            Add
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(ev) => {
          ev.preventDefault()
          void add()
        }}
      >
        <TextField
          label="Email"
          type="email"
          inputMode="email"
          value={email}
          onChange={(v) => {
            setEmail(v)
            setError(undefined)
          }}
          error={error}
          placeholder="name@company.com"
        />
        <TextField
          label="Name (optional)"
          value={name}
          onChange={setName}
          placeholder="Aina Rahman"
        />
        {/* Enter in either field adds the person */}
        <button type="submit" className="sr-only" aria-hidden tabIndex={-1} />
      </form>

      {newestFirst.length > 0 && (
        <section
          className="flex min-w-0 flex-col gap-3"
          aria-label={HAND_LIST_NAME}
        >
          <h3 className="text-sm font-semibold">
            {HAND_LIST_NAME} ({newestFirst.length})
          </h3>
          <ul className="flex flex-col divide-y rounded-xl border">
            {newestFirst.map((p) => (
              <li
                key={p.id}
                className="flex min-w-0 items-center gap-3 px-3 py-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">
                    {p.name || p.email}
                  </span>
                  {p.name && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {p.email}
                    </span>
                  )}
                </span>
                <Button
                  variant="ghost"
                  size="lg"
                  className="min-h-10 shrink-0"
                  aria-label={`Remove ${p.email}`}
                  disabled={removing !== null}
                  onClick={() => void remove(p.email)}
                >
                  {removing === p.email ? <Spinner /> : <Trash2Icon />}
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </DialogShell>
  )
}
