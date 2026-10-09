// Public links that go inside emails. Always the www host: aurapixel.live
// redirects there, and one-click unsubscribe POSTs don't follow redirects.
import { BASE_PATH } from "@/lib/base-path"

export const OPS_PUBLIC_ORIGIN =
  process.env.OPS_PUBLIC_ORIGIN ?? "https://www.aurapixel.live"

export function bannerUrl(id: string, origin = OPS_PUBLIC_ORIGIN): string {
  return id ? `${origin}${BASE_PATH}/api/blasts/banner/${id}` : ""
}

/** AuraPixel's logo for the client report (public/report-logo.png). */
export function reportLogoUrl(origin = OPS_PUBLIC_ORIGIN): string {
  return `${origin}${BASE_PATH}/report-logo.png`
}

function unsubscribeQuery(blastId: string, email: string, token: string) {
  return new URLSearchParams({ b: blastId, e: email, t: token }).toString()
}

/** The page a person lands on from the Unsubscribe link. */
export function unsubscribePageUrl(
  blastId: string,
  email: string,
  token: string
) {
  return `${OPS_PUBLIC_ORIGIN}${BASE_PATH}/unsubscribe?${unsubscribeQuery(blastId, email, token)}`
}

/** Gmail/Yahoo one-click unsubscribe (List-Unsubscribe-Post). */
export function oneClickUnsubscribeUrl(
  blastId: string,
  email: string,
  token: string
) {
  return `${OPS_PUBLIC_ORIGIN}${BASE_PATH}/api/unsubscribe?${unsubscribeQuery(blastId, email, token)}`
}

/** Test sends link here: the page explains it only works for real recipients. */
export const TEST_UNSUBSCRIBE_URL = `${OPS_PUBLIC_ORIGIN}${BASE_PATH}/unsubscribe?test=1`
