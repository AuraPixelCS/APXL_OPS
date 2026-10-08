// POST /api/users/reset-link { uid } → { link }
// A one-time "choose a new password" link to hand over by WhatsApp or email.
// Firebase links expire after an hour; afterwards the person lands back on the
// Ops login page.
import { NextResponse } from "next/server"
import { adminRoute, fail, stringField } from "@/lib/admin-route"
import { BASE_PATH } from "@/lib/base-path"

export async function POST(req: Request) {
  return adminRoute(req, async ({ auth, body }) => {
    const uid = stringField(body, "uid")
    if (!uid) return fail("Which account?")
    const user = await auth.getUser(uid)
    if (!user.email) return fail("This account has no email address.")
    const origin =
      req.headers.get("origin") ??
      process.env.NEXT_PUBLIC_SITE_ORIGIN ??
      "https://aurapixel.live"
    const link = await auth.generatePasswordResetLink(user.email, {
      url: `${origin}${BASE_PATH}/login`,
    })
    return NextResponse.json({ link })
  })
}
