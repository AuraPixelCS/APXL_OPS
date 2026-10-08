// Firebase client SDK (browser): sign-in and live Firestore reads against the
// aurapixel-ops project. GUARDED: with no NEXT_PUBLIC_FIREBASE_* env vars every
// getter returns null and the app shows a "not configured" notice.

import { type FirebaseApp, getApps, initializeApp } from "firebase/app"
import { type Auth, getAuth } from "firebase/auth"
import { type Firestore, getFirestore } from "firebase/firestore"

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

export function isFirebaseConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId
  )
}

let app: FirebaseApp | null = null

export function getClientApp(): FirebaseApp | null {
  if (!isFirebaseConfigured()) return null
  if (!app) app = getApps()[0] ?? initializeApp(firebaseConfig)
  return app
}

export function getClientAuth(): Auth | null {
  const a = getClientApp()
  return a ? getAuth(a) : null
}

export function getClientDb(): Firestore | null {
  const a = getClientApp()
  return a ? getFirestore(a) : null
}
