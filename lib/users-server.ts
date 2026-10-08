// Server-only helpers for /api/users/*: reading accounts out of Firebase Auth
// (the source of truth) merged with their `users/{uid}` profile docs, and the
// safety rules that stop an admin locking everyone out.

import type { Auth, UserRecord } from "firebase-admin/auth"
import type { Firestore } from "firebase-admin/firestore"
import { roleFromClaims } from "@/lib/roles"
import type { OpsUser } from "@/lib/users"

export async function listAllUsers(auth: Auth): Promise<UserRecord[]> {
  const out: UserRecord[] = []
  let pageToken: string | undefined
  do {
    const page = await auth.listUsers(1000, pageToken)
    out.push(...page.users)
    pageToken = page.pageToken
  } while (pageToken)
  return out
}

export function toOpsUser(
  u: UserRecord,
  profile?: FirebaseFirestore.DocumentData
): OpsUser {
  return {
    uid: u.uid,
    email: u.email ?? "",
    name: u.displayName ?? profile?.name ?? "",
    role: roleFromClaims(u.customClaims),
    company: typeof profile?.company === "string" ? profile.company : "",
    disabled: u.disabled,
    createdAt: u.metadata.creationTime
      ? new Date(u.metadata.creationTime).toISOString()
      : null,
    lastSignInAt: u.metadata.lastSignInTime
      ? new Date(u.metadata.lastSignInTime).toISOString()
      : null,
    createdBy:
      typeof profile?.createdBy === "string" ? profile.createdBy : null,
  }
}

export async function getOpsUser(
  auth: Auth,
  db: Firestore,
  uid: string
): Promise<OpsUser> {
  const [record, profile] = await Promise.all([
    auth.getUser(uid),
    db.doc(`users/${uid}`).get(),
  ])
  return toOpsUser(record, profile.data())
}

/** Admins who can still sign in. */
export async function activeAdminCount(auth: Auth): Promise<number> {
  const users = await listAllUsers(auth)
  return users.filter(
    (u) => !u.disabled && roleFromClaims(u.customClaims) === "admin"
  ).length
}

/**
 * Would this change leave Ops without an admin who can sign in? Checked before
 * deleting, demoting or suspending an admin.
 */
export async function wouldRemoveLastAdmin(
  auth: Auth,
  target: OpsUser
): Promise<boolean> {
  if (target.role !== "admin" || target.disabled) return false
  return (await activeAdminCount(auth)) <= 1
}

/** Firebase Auth error codes → something the admin can act on. */
export function authErrorMessage(err: unknown): string | null {
  const code = (err as { code?: string })?.code ?? ""
  switch (code) {
    case "auth/email-already-exists":
      return "An account with that email already exists."
    case "auth/invalid-email":
      return "That email address isn't valid."
    case "auth/invalid-password":
      return "Firebase rejected that password. Use at least 10 characters."
    case "auth/user-not-found":
      return "That account no longer exists. Refresh the list."
    default:
      return null
  }
}
