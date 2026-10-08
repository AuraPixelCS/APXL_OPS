// Single source of truth for the deployment prefix (see next.config.ts).
// Next prefixes its own output (Link, router, /_next/*, public/*) automatically;
// this is for URLs we build by hand, like fetch() calls to our API routes.
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? ""

export function withBasePath(path: string): string {
  if (!path.startsWith("/")) return `${BASE_PATH}/${path}`
  return `${BASE_PATH}${path}`
}
