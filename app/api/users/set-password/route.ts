// POST /api/users/set-password { uid, password? } → { password }
// Empty password = generate one and return it (shown once). Signs the person
// out of every other session so the old password stops working at once.
import { NextResponse } from "next/server"
import { adminRoute, fail, stringField } from "@/lib/admin-route"
import { generatePassword, passwordProblem } from "@/lib/users"

export async function POST(req: Request) {
  return adminRoute(req, async ({ admin, auth, body }) => {
    const uid = stringField(body, "uid")
    if (!uid) return fail("Which account?")
    const typed = stringField(body, "password") ?? ""
    if (typed) {
      const problem = passwordProblem(typed)
      if (problem) return fail(problem, 400, { password: problem })
    }
    const password = typed || generatePassword()
    await auth.updateUser(uid, { password })
    if (uid !== admin.uid) await auth.revokeRefreshTokens(uid)
    return NextResponse.json({ password: typed ? null : password })
  })
}
