// Firebase Admin SDK (server only). Every write to Firestore and every account
// change goes through here, from our API routes; the browser only reads.
// GUARDED: returns null when no project is configured. NEVER import this from a
// client component.
//
// Credentials, in order:
//   1. Service account: FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY. Unused:
//      the AuraPixel Google org blocks key creation
//      (iam.disableServiceAccountKeyCreation).
//   2. Vercel (production): keyless Workload Identity Federation. Vercel signs
//      each request with an OIDC token; Google trades it for a short-lived
//      token for the ops-server service account. Needs
//      GCP_WORKLOAD_IDENTITY_PROVIDER + GCP_SERVICE_ACCOUNT_EMAIL; the Google
//      side is set up by scripts/setup-vercel-access.mjs.
//   3. Application Default Credentials: on a Mac, `gcloud auth
//      application-default login` as aurapixelcreativestudio@gmail.com. The
//      quota project comes from GOOGLE_CLOUD_QUOTA_PROJECT in .env.local.

import { getVercelOidcToken } from "@vercel/oidc"
import {
  applicationDefault,
  type App,
  cert,
  type Credential,
  getApps,
  initializeApp,
} from "firebase-admin/app"
import { type Auth, getAuth } from "firebase-admin/auth"
import { Firestore, getFirestore } from "firebase-admin/firestore"
import { type AuthClient, ExternalAccountClient } from "google-auth-library"

function adminConfig() {
  return {
    projectId:
      process.env.FIREBASE_PROJECT_ID ??
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    // Env stores the PEM with literal "\n"; restore real newlines.
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    // projects/<number>/locations/global/workloadIdentityPools/<pool>/providers/<provider>
    wifProvider: process.env.GCP_WORKLOAD_IDENTITY_PROVIDER,
    serviceAccount: process.env.GCP_SERVICE_ACCOUNT_EMAIL,
  }
}

export function isAdminConfigured(): boolean {
  return Boolean(adminConfig().projectId)
}

const CLOUD_PLATFORM = "https://www.googleapis.com/auth/cloud-platform"

let federated: AuthClient | null | undefined

/** The keyless Vercel → Google client, or null when not running that way. */
function federatedClient(): AuthClient | null {
  if (federated !== undefined) return federated
  const c = adminConfig()
  federated =
    !(c.clientEmail && c.privateKey) && c.wifProvider && c.serviceAccount
      ? ExternalAccountClient.fromJSON({
          type: "external_account",
          audience: `//iam.googleapis.com/${c.wifProvider}`,
          subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
          token_url: "https://sts.googleapis.com/v1/token",
          service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${c.serviceAccount}:generateAccessToken`,
          scopes: [CLOUD_PLATFORM],
          subject_token_supplier: {
            getSubjectToken: () => getVercelOidcToken(),
          },
        })
      : null
  return federated
}

/** Adapts the federated client to the shape firebase-admin asks for. */
function federatedCredential(client: AuthClient): Credential {
  return {
    async getAccessToken() {
      const { token } = await client.getAccessToken()
      if (!token) throw new Error("Google returned no access token.")
      const expiry = client.credentials.expiry_date
      return {
        access_token: token,
        expires_in: expiry
          ? Math.max(0, Math.floor((expiry - Date.now()) / 1000))
          : 300,
      }
    },
  }
}

let adminApp: App | null = null
let firestore: Firestore | null = null

function getAdminApp(): App | null {
  if (!isAdminConfigured()) return null
  if (!adminApp) {
    const c = adminConfig()
    const client = federatedClient()
    adminApp =
      getApps()[0] ??
      initializeApp({
        projectId: c.projectId,
        credential: client
          ? federatedCredential(client)
          : c.clientEmail && c.privateKey
            ? cert({
                projectId: c.projectId,
                clientEmail: c.clientEmail,
                privateKey: c.privateKey,
              })
            : applicationDefault(),
      })
  }
  return adminApp
}

export function adminDb(): Firestore | null {
  const a = getAdminApp()
  if (!a) return null
  if (!firestore) {
    const client = federatedClient()
    // firebase-admin's getFirestore() only accepts a key or ADC, so the
    // federated case builds the client directly. Same Firestore class
    // (re-exported by firebase-admin), so FieldValue sentinels still match.
    // preferRest skips gRPC's slow serverless cold start.
    firestore = client
      ? new Firestore({
          projectId: adminConfig().projectId,
          authClient: client,
          preferRest: true,
        })
      : getFirestore(a)
  }
  return firestore
}

export function adminAuth(): Auth | null {
  const a = getAdminApp()
  return a ? getAuth(a) : null
}
