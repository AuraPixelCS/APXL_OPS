// The two kinds of Ops account. Stored as custom claims on the Firebase Auth
// user: admins carry { admin: true, role: "admin" } (firestore.rules checks
// `admin`), clients carry { role: "client" }. Shared by browser and server.

export type AppRole = "admin" | "client"

export const ROLE_LABEL: Record<AppRole, string> = {
  admin: "Admin",
  client: "Client",
}

export function roleFromClaims(
  claims: Record<string, unknown> | undefined | null
): AppRole | null {
  if (!claims) return null
  if (claims.admin === true || claims.role === "admin") return "admin"
  if (claims.role === "client") return "client"
  return null
}

export function claimsForRole(role: AppRole): Record<string, unknown> {
  return role === "admin" ? { admin: true, role: "admin" } : { role: "client" }
}
