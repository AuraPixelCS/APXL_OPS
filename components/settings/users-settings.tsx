"use client"

import {
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from "firebase/auth"
import {
  BanIcon,
  KeyRoundIcon,
  LinkIcon,
  MailIcon,
  MoreHorizontalIcon,
  PencilIcon,
  RotateCcwIcon,
  SearchIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react"
import * as React from "react"
import { useAuth } from "@/components/auth/auth-provider"
import { ConfirmDialog } from "@/components/common/dialog-shell"
import { EmptyState } from "@/components/common/empty-state"
import { FilterTabs } from "@/components/common/filter-tabs"
import {
  CredentialsDialog,
  PasswordDialog,
  UserFormDialog,
} from "@/components/settings/user-dialogs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { toast } from "@/components/ui/toast"
import { apiPost } from "@/lib/api"
import { withBasePath } from "@/lib/base-path"
import { getClientAuth } from "@/lib/firebase/client"
import { formatRelative } from "@/lib/format"
import { ROLE_LABEL } from "@/lib/roles"
import type { OpsUser } from "@/lib/users"

type Filter = "all" | "admin" | "client"

type Dialog =
  | { kind: "add" }
  | { kind: "edit"; user: OpsUser }
  | { kind: "password"; user: OpsUser }
  | { kind: "credentials"; email: string; password: string; title: string }
  | { kind: "delete"; user: OpsUser }
  | { kind: "suspend"; user: OpsUser }
  | { kind: "restore"; user: OpsUser }

type Action =
  | "edit"
  | "password"
  | "reset-email"
  | "reset-link"
  | "suspend"
  | "restore"
  | "delete"

function loginUrl() {
  return typeof window === "undefined"
    ? ""
    : `${window.location.origin}${withBasePath("/login")}`
}

export function UsersSettings() {
  const { user: me } = useAuth()
  const [users, setUsers] = React.useState<OpsUser[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [filter, setFilter] = React.useState<Filter>("all")
  const [search, setSearch] = React.useState("")
  const [dialog, setDialog] = React.useState<Dialog | null>(null)
  const close = () => setDialog(null)

  // Bumped after every change to refetch the list.
  const [version, setVersion] = React.useState(0)
  const reload = () => setVersion((v) => v + 1)

  React.useEffect(() => {
    let cancelled = false
    apiPost<{ users: OpsUser[] }>("/api/users/list", {}).then(
      (res) => {
        if (cancelled) return
        setUsers(res.users)
        setError(null)
      },
      (e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Couldn't load users.")
      }
    )
    return () => {
      cancelled = true
    }
  }, [version])

  const admins = users?.filter((u) => u.role === "admin").length ?? 0
  const clients = users?.filter((u) => u.role === "client").length ?? 0
  const q = search.trim().toLowerCase()
  const visible = (users ?? []).filter(
    (u) =>
      (filter === "all" || u.role === filter) &&
      (!q ||
        u.name.toLowerCase().includes(q) ||
        u.email.includes(q) ||
        u.company.toLowerCase().includes(q))
  )

  // Re-signs-in the current admin after they change their OWN password, since a
  // password change can end the current session.
  async function keepMeSignedIn(newPassword: string) {
    const auth = getClientAuth()
    if (auth && me?.email)
      await signInWithEmailAndPassword(auth, me.email, newPassword).catch(
        () => {}
      )
  }

  async function run(action: Action, u: OpsUser) {
    if (
      action === "edit" ||
      action === "password" ||
      action === "delete" ||
      action === "suspend" ||
      action === "restore"
    ) {
      setDialog({ kind: action, user: u })
      return
    }
    if (action === "reset-email") {
      const auth = getClientAuth()
      if (!auth) return
      try {
        await sendPasswordResetEmail(auth, u.email, { url: loginUrl() })
        toast.success({
          title: "Reset email sent",
          description: `${u.email} will get a link to choose a new password.`,
        })
      } catch (e) {
        toast.error({
          title: "Couldn't send the email",
          description: e instanceof Error ? e.message : undefined,
        })
      }
      return
    }
    if (action === "reset-link") {
      try {
        const { link } = await apiPost<{ link: string }>(
          "/api/users/reset-link",
          { uid: u.uid }
        )
        await navigator.clipboard.writeText(link)
        toast.success({
          title: "Reset link copied",
          description: "Send it to them. It works once, within an hour.",
        })
      } catch (e) {
        toast.error({
          title: "Couldn't make a link",
          description: e instanceof Error ? e.message : undefined,
        })
      }
    }
  }

  return (
    <div className="flex flex-col gap-5 pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-heading text-base font-semibold">
            People who can sign in
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {users
              ? `${admins} ${admins === 1 ? "admin" : "admins"} · ${clients} ${clients === 1 ? "client" : "clients"}`
              : error
                ? "Admins and clients"
                : "Loading…"}
          </p>
        </div>
        <Button size="xl" onClick={() => setDialog({ kind: "add" })}>
          <UserPlusIcon />
          Add user
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>Couldn&rsquo;t load users</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <FilterTabs<Filter>
          value={filter}
          onChange={setFilter}
          label="Filter users"
          options={[
            { value: "all", label: "All" },
            { value: "admin", label: "Admins" },
            { value: "client", label: "Clients" },
          ]}
        />
        <InputGroup className="h-10 w-full md:w-72">
          <InputGroupAddon>
            <SearchIcon aria-hidden />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            placeholder="Search name, email or business"
            aria-label="Search users"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </InputGroup>
      </div>

      {!users && !error ? (
        <div
          className="flex flex-col gap-2"
          role="status"
          aria-label="Loading users"
        >
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : users && users.length > 0 && visible.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          Nobody matches this filter.
        </p>
      ) : users && users.length === 0 ? (
        <EmptyState
          icon={UsersIcon}
          title="No users yet"
          body="Add the first admin or client."
        />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Business</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last signed in</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((u) => (
                  <TableRow key={u.uid}>
                    <TableCell className="max-w-72">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">
                          {u.name || "Unnamed"}
                        </span>
                        {u.uid === me?.uid && (
                          <Badge variant="outline">You</Badge>
                        )}
                      </div>
                      <span className="block truncate text-sm text-muted-foreground">
                        {u.email}
                      </span>
                    </TableCell>
                    <TableCell>
                      <RoleBadge user={u} />
                    </TableCell>
                    <TableCell className="max-w-56 truncate text-muted-foreground">
                      {u.company || "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge user={u} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {u.lastSignInAt
                        ? formatRelative(new Date(u.lastSignInAt))
                        : "Never"}
                    </TableCell>
                    <TableCell>
                      <RowMenu
                        user={u}
                        isSelf={u.uid === me?.uid}
                        onAction={run}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ul className="flex flex-col gap-2 md:hidden">
            {visible.map((u) => (
              <li
                key={u.uid}
                className="flex items-start gap-3 rounded-xl border bg-card px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2">
                    <span className="truncate font-medium">
                      {u.name || "Unnamed"}
                    </span>
                    {u.uid === me?.uid && <Badge variant="outline">You</Badge>}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {u.email}
                  </p>
                  {u.company && (
                    <p className="truncate text-sm text-muted-foreground">
                      {u.company}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <RoleBadge user={u} />
                    <StatusBadge user={u} />
                  </div>
                </div>
                <RowMenu user={u} isSelf={u.uid === me?.uid} onAction={run} />
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Dialogs */}
      {dialog?.kind === "add" && (
        <UserFormDialog
          open
          onClose={close}
          onSaved={() => {}}
          onCreated={(created, generated, typed) => {
            reload()
            if (generated) {
              setDialog({
                kind: "credentials",
                email: created.email,
                password: generated,
                title: `${ROLE_LABEL[created.role ?? "client"]} added: ${created.name}`,
              })
            } else {
              close()
              toast.success({
                title: `${created.name} added`,
                description: typed
                  ? "They can sign in with the password you set."
                  : undefined,
              })
            }
          }}
        />
      )}
      {dialog?.kind === "edit" && (
        <UserFormDialog
          open
          onClose={close}
          user={dialog.user}
          isSelf={dialog.user.uid === me?.uid}
          onCreated={() => {}}
          onSaved={(saved) => {
            close()
            reload()
            toast.success({ title: `${saved.name || saved.email} updated` })
          }}
        />
      )}
      {dialog?.kind === "password" && (
        <PasswordDialog
          open
          onClose={close}
          user={dialog.user}
          isSelf={dialog.user.uid === me?.uid}
          onDone={async (generated, typed) => {
            const u = dialog.user
            if (u.uid === me?.uid) await keepMeSignedIn(generated ?? typed)
            if (generated) {
              setDialog({
                kind: "credentials",
                email: u.email,
                password: generated,
                title: `New password for ${u.name || u.email}`,
              })
            } else {
              close()
              toast.success({
                title: "Password changed",
                description:
                  u.uid === me?.uid
                    ? undefined
                    : `${u.email} has been signed out everywhere.`,
              })
            }
          }}
        />
      )}
      {dialog?.kind === "credentials" && (
        <CredentialsDialog
          open
          onClose={close}
          email={dialog.email}
          password={dialog.password}
          loginUrl={loginUrl()}
          title={dialog.title}
        />
      )}
      {dialog?.kind === "delete" && (
        <ConfirmDialog
          open
          onClose={close}
          destructive
          title={`Delete ${dialog.user.name || dialog.user.email}?`}
          body={`${dialog.user.email} won't be able to sign in any more. This can't be undone.`}
          confirmLabel="Delete account"
          onConfirm={async () => {
            await apiPost("/api/users/delete", { uid: dialog.user.uid })
            close()
            reload()
            toast.success({ title: "Account deleted" })
          }}
        />
      )}
      {(dialog?.kind === "suspend" || dialog?.kind === "restore") && (
        <ConfirmDialog
          open
          onClose={close}
          destructive={dialog.kind === "suspend"}
          title={
            dialog.kind === "suspend"
              ? `Suspend ${dialog.user.name || dialog.user.email}?`
              : `Restore ${dialog.user.name || dialog.user.email}?`
          }
          body={
            dialog.kind === "suspend"
              ? "They're signed out at once and can't sign in until you restore access. Nothing is deleted."
              : "They'll be able to sign in again with their current password."
          }
          confirmLabel={
            dialog.kind === "suspend" ? "Suspend access" : "Restore access"
          }
          onConfirm={async () => {
            await apiPost("/api/users/update", {
              uid: dialog.user.uid,
              disabled: dialog.kind === "suspend",
            })
            close()
            reload()
            toast.success({
              title:
                dialog.kind === "suspend"
                  ? "Access suspended"
                  : "Access restored",
            })
          }}
        />
      )}
    </div>
  )
}

function RoleBadge({ user }: { user: OpsUser }) {
  if (!user.role) return <Badge variant="outline">No access</Badge>
  return (
    <Badge variant={user.role === "admin" ? "info" : "secondary"}>
      {ROLE_LABEL[user.role]}
    </Badge>
  )
}

function StatusBadge({ user }: { user: OpsUser }) {
  return user.disabled ? (
    <Badge variant="warning">Suspended</Badge>
  ) : (
    <Badge variant="success">Active</Badge>
  )
}

function RowMenu({
  user,
  isSelf,
  onAction,
}: {
  user: OpsUser
  isSelf: boolean
  onAction: (action: Action, user: OpsUser) => void
}) {
  return (
    <Menu onSelect={(d) => onAction(d.value as Action, user)}>
      <MenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xl"
          aria-label={`Actions for ${user.name || user.email}`}
        >
          <MoreHorizontalIcon />
        </Button>
      </MenuTrigger>
      <MenuContent className="min-w-56">
        <MenuItem value="edit">
          <PencilIcon />
          Edit details
        </MenuItem>
        <MenuItem value="password">
          <KeyRoundIcon />
          Set a new password
        </MenuItem>
        <MenuItem value="reset-email">
          <MailIcon />
          Email a reset link
        </MenuItem>
        <MenuItem value="reset-link">
          <LinkIcon />
          Copy a reset link
        </MenuItem>
        {!isSelf && (
          <>
            <MenuSeparator />
            {user.disabled ? (
              <MenuItem value="restore">
                <RotateCcwIcon />
                Restore access
              </MenuItem>
            ) : (
              <MenuItem value="suspend">
                <BanIcon />
                Suspend access
              </MenuItem>
            )}
            <MenuItem value="delete" variant="destructive">
              <Trash2Icon />
              Delete account
            </MenuItem>
          </>
        )}
      </MenuContent>
    </Menu>
  )
}
