"use client"

import { AssistantSettings } from "@/components/settings/assistant-settings"
import { ClientsSettings } from "@/components/settings/clients-settings"
import { Connections } from "@/components/settings/connections"
import { EmailSettings } from "@/components/settings/email-settings"
import { ScoringSettings } from "@/components/settings/scoring-settings"
import { UsersSettings } from "@/components/settings/users-settings"
import { AppShell } from "@/components/shell/app-shell"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const TABS = [
  { value: "users", label: "Users", content: <UsersSettings /> },
  { value: "email", label: "Email", content: <EmailSettings /> },
  { value: "clients", label: "Clients", content: <ClientsSettings /> },
  { value: "assistant", label: "Assistant", content: <AssistantSettings /> },
  { value: "scoring", label: "Lead scoring", content: <ScoringSettings /> },
  { value: "connections", label: "Connections", content: <Connections /> },
]

export function SettingsPage() {
  return (
    <AppShell title="Settings">
      <Tabs defaultValue="users" className="flex flex-1 flex-col">
        <div className="sticky top-14 z-10 border-b bg-background/90 page-x backdrop-blur-md">
          <TabsList
            variant="underline"
            className="max-w-full [scrollbar-width:none] justify-start overflow-x-auto [&::-webkit-scrollbar]:hidden"
          >
            {TABS.map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="min-h-11 shrink-0 px-3 text-sm whitespace-nowrap"
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {TABS.map((t) => (
          <TabsContent
            key={t.value}
            value={t.value}
            className="flex flex-col page-x pt-5 sm:pt-6"
          >
            {t.content}
          </TabsContent>
        ))}
      </Tabs>
    </AppShell>
  )
}
