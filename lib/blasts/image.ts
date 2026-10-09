// Prepares a banner in the browser before upload: at most 1200px wide (twice
// the 600px email width, sharp on phones) and under ~880 KB, as JPEG unless a
// small PNG/GIF can go as it is (keeps transparency and animation).

const MAX_WIDTH = 1200
const MAX_BYTES = 880_000

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "")
    r.onerror = () => reject(new Error("Couldn't read that image."))
    r.readAsDataURL(blob)
  })
}

export async function prepareBanner(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|gif|webp)$/.test(file.type))
    throw new Error("Use a JPG, PNG, GIF or WebP image.")
  if (file.size > 20 * 1024 * 1024)
    throw new Error("That image is over 20 MB. Use a smaller one.")
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("Couldn't open that image. Try saving it as a JPG.")
  })
  const fits = bitmap.width <= MAX_WIDTH && file.size <= MAX_BYTES
  if (fits && file.type !== "image/webp") return toBase64(file)
  if (file.type === "image/gif")
    throw new Error("Animated GIFs need to be under 880 KB and 1200px wide.")

  const scale = Math.min(1, MAX_WIDTH / bitmap.width)
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Couldn't resize that image.")
  ctx.fillStyle = "#ffffff" // JPEG has no transparency
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  for (const quality of [0.88, 0.8, 0.7, 0.6]) {
    const blob = await new Promise<Blob | null>((r) =>
      canvas.toBlob(r, "image/jpeg", quality)
    )
    if (blob && blob.size <= MAX_BYTES) return toBase64(blob)
  }
  throw new Error(
    "That image is too large even after shrinking. Try a simpler one."
  )
}
