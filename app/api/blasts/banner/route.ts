// POST /api/blasts/banner { blastId, data (base64), contentType } → { id, url }
// Stores a banner image for a blast. The browser has already resized it; it's
// kept in Firestore (bytes) and served publicly by /api/blasts/banner/[id] so
// email apps can load it.
import { FieldValue } from "firebase-admin/firestore"
import { NextResponse } from "next/server"
import { adminRoute, fail, stringField } from "@/lib/admin-route"
import { bannerUrl } from "@/lib/blasts/urls"

/** Firestore documents max out at 1 MiB. */
const MAX_BYTES = 900_000

function sniff(buf: Buffer): string | null {
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg"
  if (buf.subarray(0, 4).toString("hex") === "89504e47") return "image/png"
  if (buf.subarray(0, 3).toString("ascii") === "GIF") return "image/gif"
  return null
}

export async function POST(req: Request) {
  return adminRoute(req, async ({ admin, db, body }) => {
    const blastId = stringField(body, "blastId")
    if (!blastId || !(await db.doc(`blasts/${blastId}`).get()).exists)
      return fail("That blast no longer exists.", 404)
    const data = Buffer.from(stringField(body, "data") ?? "", "base64")
    const type = sniff(data)
    if (!type) return fail("Use a JPG, PNG or GIF image.")
    if (data.length > MAX_BYTES)
      return fail("That image is too large. Use one under 900 KB.")
    const ref = db.collection("blastAssets").doc()
    await ref.set({
      data,
      contentType: type,
      size: data.length,
      blastId,
      createdBy: admin.email ?? admin.uid,
      createdAt: FieldValue.serverTimestamp(),
    })
    return NextResponse.json({ id: ref.id, url: bannerUrl(ref.id) })
  })
}
