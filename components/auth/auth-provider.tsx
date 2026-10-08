"use client"

import { getIdTokenResult, onAuthStateChanged, type User } from "firebase/auth"
import * as React from "react"
import { getClientAuth, isFirebaseConfigured } from "@/lib/firebase/client"
import { type AppRole, roleFromClaims } from "@/lib/roles"

interface AuthState {
  configured: boolean
  loading: boolean
  user: User | null
  /** From the account's custom claims; null = signed in but no Ops role. */
  role: AppRole | null
  isAdmin: boolean
}

const AuthContext = React.createContext<AuthState>({
  configured: false,
  loading: true,
  user: null,
  role: null,
  isAdmin: false,
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const configured = isFirebaseConfigured()
  const [state, setState] = React.useState<Omit<AuthState, "configured">>({
    loading: configured,
    user: null,
    role: null,
    isAdmin: false,
  })

  React.useEffect(() => {
    const auth = getClientAuth()
    if (!auth) return
    return onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setState({ loading: false, user: null, role: null, isAdmin: false })
        return
      }
      // Force-refresh so a role granted or changed minutes ago is picked up.
      const token = await getIdTokenResult(user, true).catch(() => null)
      const role = roleFromClaims(token?.claims)
      setState({ loading: false, user, role, isAdmin: role === "admin" })
    })
  }, [])

  return (
    <AuthContext.Provider value={{ configured, ...state }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => React.useContext(AuthContext)
