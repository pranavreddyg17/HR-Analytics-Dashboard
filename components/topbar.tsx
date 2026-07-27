"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { Bell, Bot, ChevronDown, LogOut, Plus, Search } from "lucide-react"
import { signOut } from "next-auth/react"

import { BrandLogo } from "@/components/brand-logo"
import type { ShellUser } from "@/components/app-sidebar"

const pageMeta: Record<string, { title: string; subtitle: string }> = {
  "/": { title: "Home", subtitle: "Your people operations, in one calm place" },
  "/people": { title: "People", subtitle: "Directory, profiles, and employee records" },
  "/inbox": { title: "Inbox", subtitle: "Approvals and work that needs your attention" },
  "/attrition": { title: "Attrition risk", subtitle: "Explainable signals for responsible human review" },
  "/ai-agents": { title: "AI assistant", subtitle: "Ask questions across your workforce data" },
  "/data": { title: "Data hub", subtitle: "Imports, integrations, and data readiness" },
  "/access": { title: "Access", subtitle: "Google sign-in, roles, and workspace membership" },
  "/learning": { title: "Data & model", subtitle: "Model provenance, quality, and limitations" },
  "/employees": { title: "People", subtitle: "Directory, profiles, and employee records" },
  "/risk-review": { title: "Model review", subtitle: "Historical scored records for responsible audit" },
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "HR"
}

export function Topbar({ user, onOpenPalette }: { user: ShellUser; onOpenPalette: () => void }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  let meta = pageMeta[pathname] ?? pageMeta["/"]
  if (pathname === "/insights") {
    const view = searchParams.get("view")
    meta = view === "hiring"
      ? { title: "Hiring", subtitle: "Recruiting health, velocity, and source performance" }
      : view === "leave"
        ? { title: "Time off", subtitle: "Leave patterns, balances, and approvals" }
        : view === "training"
          ? { title: "Growth", subtitle: "Learning, compliance, and career mobility" }
          : { title: "Insights", subtitle: "Explore every workforce signal in context" }
  } else if (pathname.startsWith("/people/")) {
    meta = { title: "Employee profile", subtitle: "People record and activity" }
  }

  return (
    <header className="topbar">
      <Link href="/" className="md:hidden" aria-label="LaidbackHR.AI home">
        <BrandLogo compact />
      </Link>

      <div className="hidden min-w-0 flex-col md:flex">
        <p className="truncate text-[15px] font-semibold tracking-[-0.01em] text-foreground">{meta.title}</p>
        <p className="truncate text-xs text-muted-foreground">{meta.subtitle}</p>
      </div>

      <button type="button" onClick={onOpenPalette} className="topbar-search" aria-label="Search people and navigate">
        <Search className="size-4" strokeWidth={1.8} />
        <span className="truncate">Search people, pages, or actions</span>
        <kbd>⌘K</kbd>
      </button>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <Link href="/ai-agents" className="topbar-icon-button hidden sm:inline-flex" aria-label="Open AI assistant" title="AI assistant">
          <Bot className="size-[18px]" strokeWidth={1.8} />
        </Link>
        <Link href="/inbox" className="topbar-icon-button" aria-label="Open inbox" title="Inbox">
          <Bell className="size-[18px]" strokeWidth={1.8} />
          <span className="notification-dot" aria-hidden="true" />
        </Link>
        <Link href="/people?new=1" className="topbar-add-button">
          <Plus className="size-4" strokeWidth={2} />
          <span className="hidden sm:inline">Add employee</span>
        </Link>

        <details className="user-menu">
          <summary aria-label="Open account menu">
            <span className="avatar-soft avatar-soft--small">{initials(user.displayName)}</span>
            <span className="hidden max-w-28 truncate text-sm font-semibold lg:inline">{user.displayName}</span>
            <ChevronDown className="hidden size-3.5 text-muted-foreground lg:block" />
          </summary>
          <div className="user-menu__popover">
            <div className="border-b border-border px-3.5 py-3">
              <p className="truncate text-sm font-semibold">{user.displayName}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{user.email}</p>
            </div>
            {user.authenticated ? (
              <button type="button" onClick={() => signOut({ callbackUrl: "/login" })} className="user-menu__item w-full">
                <LogOut className="size-4" /> Sign out
              </button>
            ) : (
              <p className="px-3.5 py-2.5 text-xs text-muted-foreground">Local development session</p>
            )}
          </div>
        </details>
      </div>
    </header>
  )
}
