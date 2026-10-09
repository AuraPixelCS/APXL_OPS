// POST /api/unsubscribe — PUBLIC.
// From the unsubscribe page: JSON { b, e, t }. From Gmail/Yahoo one-click
// unsubscribe: the same values in the query string (body is
// "List-Unsubscribe=One-Click"). The token must match the one we sent that
// person, so nobody can unsubscribe someone else. Unsubscribes apply to every
// blast. GET does nothing on purpose: link scanners open links.
import { FieldValue } from "firebase-admin/firestore"
import { NextResponse } from "next/server"
import { emailDocId } from "@/lib/blasts/email"
import { adminDb } from "@/lib/firebase/admin"

export async function POST(req: Request) {
  const q = new URL(req.url).searchParams
  let b = q.get("b")
  let e = q.get("e")
  let t = q.get("t")
  if (!b || !e || !t) {
    const json = (await req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null
    b = typeof json?.b === "string" ? json.b : null
    e = typeof json?.e === "string" ? json.e : null
    t = typeof json?.t === "string" ? json.t : null
  }
  const invalid = NextResponse.json(
    {
      error:
        "This unsubscribe link isn't valid. Reply to the email and ask to be removed.",
    },
    { status: 404 }
  )
  if (!b || !e || !t || !/^[A-Za-z0-9]{1,40}$/.test(b) || t.length > 64)
    return invalid
  const db = adminDb()
  if (!db)
    return NextResponse.json(
      { error: "Try again in a moment." },
      { status: 503 }
    )
  try {
    const email = emailDocId(e)
    const rec = await db.doc(`blasts/${b}/recipients/${email}`).get()
    if (!rec.exists || rec.get("token") !== t) return invalid
    await db
      .doc(`unsubscribes/${email}`)
      .set(
        { email, blastId: b, at: FieldValue.serverTimestamp() },
        { merge: true }
      )
    await rec.ref.update({ unsubscribedAt: FieldValue.serverTimestamp() })
    return NextResponse.json({ ok: true, email })
  } catch (err) {
    console.error(
      "[ops] unsubscribe:",
      err instanceof Error ? err.message : err
    )
    return NextResponse.json(
      { error: "Try again in a moment." },
      { status: 503 }
    )
  }
}
