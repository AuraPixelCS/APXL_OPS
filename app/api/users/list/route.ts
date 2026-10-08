// POST /api/users/list → { users: OpsUser[] }, admins first.
import { NextResponse } from "next/server"
import { adminRoute } from "@/lib/admin-route"
import { listAllUsers, toOpsUser } from "@/lib/users-server"

export async function POST(req: Request) {
  return adminRoute(req, async ({ auth, db }) => {
    const [records, profiles] = await Promise.all([
      listAllUsers(auth),
      db.collection("users").get(),
    ])
    const byUid = new Map(profiles.docs.map((d) => [d.id, d.data()]))
    const users = records
      .map((r) => toOpsUser(r, byUid.get(r.uid)))
      .sort((a, b) =>
        a.role === b.role
          ? (a.name || a.email).localeCompare(b.name || b.email)
          : a.role === "admin"
            ? -1
            : 1
      )
    return NextResponse.json({ users })
  })
}
