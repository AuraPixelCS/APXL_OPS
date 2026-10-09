// Seals the few secrets that have to live in Firestore (clients' Resend keys)
// with AES-256-GCM. The key is OPS_SECRETS_KEY (32 random bytes, base64) on
// the server only: `npm run setup:secrets` puts it on Vercel and in
// .env.local. The browser never sees either. Server only.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

function masterKey(): Buffer | null {
  const key = Buffer.from(process.env.OPS_SECRETS_KEY ?? "", "base64")
  return key.length === 32 ? key : null
}

export function secretsReady(): boolean {
  return masterKey() !== null
}

/** "v1:<iv>:<tag>:<ciphertext>", all base64. */
export function sealSecret(plain: string): string {
  const key = masterKey()
  if (!key) throw new Error("OPS_SECRETS_KEY isn't set")
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  return [
    "v1",
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    data.toString("base64"),
  ].join(":")
}

/** The secret, or null when it can't be opened (no key, wrong key, tampered). */
export function openSecret(sealed: string): string | null {
  const key = masterKey()
  const [v, iv, tag, data] = sealed.split(":")
  if (!key || v !== "v1" || !iv || !tag || !data) return null
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(iv, "base64")
    )
    decipher.setAuthTag(Buffer.from(tag, "base64"))
    return Buffer.concat([
      decipher.update(Buffer.from(data, "base64")),
      decipher.final(),
    ]).toString("utf8")
  } catch {
    return null
  }
}
