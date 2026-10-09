"use client"

import { signOut } from "firebase/auth"
import {
  FileSpreadsheetIcon,
  LogOutIcon,
  SendIcon,
  SettingsIcon,
  UsersIcon,
} from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useAuth } from "@/components/auth/auth-provider"
import { Brand } from "@/components/shell/brand"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { getClientAuth } from "@/lib/firebase/client"

const NAV_GROUPS = [
  {
    label: "Sales",
    items: [
      {
        href: "/leads",
        label: "Leads",
        icon: UsersIcon,
        isActive: (p: string) => p === "/leads" || p.startsWith("/leads/"),
      },
      {
        href: "/sheets",
        label: "Sheets",
        icon: FileSpreadsheetIcon,
        isActive: (p: string) => p.startsWith("/sheets"),
      },
      {
        href: "/blasts",
        label: "Email blasts",
        icon: SendIcon,
        isActive: (p: string) => p.startsWith("/blasts"),
      },
    ],
  },
  {
    label: "Workspace",
    items: [
      {
        href: "/settings",
        label: "Settings",
        icon: SettingsIcon,
        isActive: (p: string) => p.startsWith("/settings"),
      },
    ],
  },
]

export function AppShell({
  children,
  title,
  actions,
}: {
  children: React.ReactNode
  title?: React.ReactNode
  actions?: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { user } = useAuth()

  const initials = (user?.displayName ?? user?.email ?? "?")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("")

  async function handleSignOut() {
    const auth = getClientAuth()
    if (auth) await signOut(auth)
    router.replace("/login")
  }

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader className="h-14 justify-center">
          <Brand compact className="group-data-[state=expanded]:hidden" />
          <Brand className="group-data-[state=collapsed]:hidden" />
        </SidebarHeader>
        <SidebarContent>
          {NAV_GROUPS.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={item.isActive(pathname)}
                        tooltip={item.label}
                      >
                        <Link href={item.href}>
                          <item.icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </SidebarContent>
        <SidebarFooter>
          <div className="flex items-center gap-2 overflow-hidden rounded-lg p-1">
            <Avatar className="size-8 shrink-0">
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 group-data-[state=collapsed]:hidden">
              <p className="truncate text-sm font-medium">
                {user?.displayName ?? "Admin"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {user?.email}
              </p>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-lg"
                  aria-label="Sign out"
                  className="group-data-[state=collapsed]:hidden"
                  onClick={handleSignOut}
                >
                  <LogOutIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Sign out</TooltipContent>
            </Tooltip>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border/70 bg-background/85 px-3 backdrop-blur-md sm:px-4">
          <SidebarTrigger aria-label="Toggle navigation" className="size-10" />
          <Separator orientation="vertical" className="mx-1 h-5" />
          <div className="min-w-0 flex-1 truncate font-heading text-sm font-medium sm:text-base">
            {title}
          </div>
          <div className="flex items-center gap-1.5">{actions}</div>
        </header>
        <div className="flex flex-1 flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
