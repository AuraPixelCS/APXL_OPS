// POST /api/settings/status
//
// What this server is connected to, for the Settings > Connections tab. Only
// reports WHETHER each secret is set, never its value.

import { NextResponse } from "next/server"
import { verifyAdmin } from "@/lib/firebase/admin-guard"

export interface ConnectionStatus {
  database: { projectId: string | null }
  assistant: boolean
  n8n: boolean
}

export async function POST(req: Request) {
  if (!(await verifyAdmin(req))) {
    return NextResponse.json(
      { error: "Sign in with an admin account." },
      { status: 401 }
    )
  }
  const status: ConnectionStatus = {
    database: {
      projectId:
        process.env.FIREBASE_PROJECT_ID ??
        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ??
        null,
    },
    assistant: Boolean(process.env.ANTHROPIC_API_KEY),
    n8n: Boolean(process.env.N8N_WEBHOOK_URL && process.env.OPS_WEBHOOK_SECRET),
  }
  return NextResponse.json(status)
}
