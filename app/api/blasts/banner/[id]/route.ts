// GET /api/blasts/banner/[id] → the image. PUBLIC: email apps (and Gmail's
// image proxy) load banners from here. Ids are random and images never change,
// so it caches for a year.
import { adminDb } from "@/lib/firebase/admin"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  if (!/^[A-Za-z0-9]{10,40}$/.test(id))
    return new Response("Not found", { status: 404 })
  const db = adminDb()
  if (!db) return new Response("Unavailable", { status: 503 })
  try {
    const snap = await db.doc(`blastAssets/${id}`).get()
    const data = snap.get("data") as Buffer | undefined
    if (!snap.exists || !data) return new Response("Not found", { status: 404 })
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": String(snap.get("contentType") ?? "image/jpeg"),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    })
  } catch (err) {
    console.error("[ops] banner:", err instanceof Error ? err.message : err)
    return new Response("Unavailable", { status: 503 })
  }
}
