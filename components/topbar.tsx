"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { Bell, ChevronDown, LogOut, Search } from "lucide-react"
import { signOut } from "next-auth/react"

import { BrandLogo } from "@/components/brand-logo"
import type { ShellUser } from "@/components/app-sidebar"

const pageTitles: Record<string, string> = {
  "/": "Overview",
  "/people": "People",
  "/inbox": "Inbox",
  "/hiring": "Hiring",
  "/time-off": "Time off",
  "/attrition": "Attrition risk",
  "/ai-agents": "Analytics assistant",
  "/data": "Data Hub",
  "/access": "Access",
  "/learning": "Learning",
  "/employees": "People",
  "/risk-review": "Model review",
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "HR"
}

export function Topbar({ user, onOpenPalette }: { user: ShellUser; onOpenPalette: () => void }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  let title = pageTitles[pathname] ?? pageTitles["/"]
  if (pathname === "/insights") {
    const view = searchParams.get("view")
    title = view === "hiring"
      ? "Hiring"
      : view === "leave"
        ? "Time off"
        : view === "training"
          ? "Learning"
          : "Insights"
  } else if (pathname.startsWith("/people/")) {
    title = "Employee profile"
  }

  return (
    <header className="topbar">
      <Link href="/" className="md:hidden" aria-label="LaidbackHR.AI home">
        <BrandLogo compact />
      </Link>

      <p className="topbar__title hidden truncate text-sm font-semibold text-foreground md:block">{title}</p>

      <button
        type="button"
        onClick={onOpenPalette}
        className="topbar-search hidden md:flex"
        aria-label="Search pages, actions, reports, and people"
      >
        <Search className="size-4" strokeWidth={1.8} />
        <span>Search people, pages, and actions</span>
      </button>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <button type="button" onClick={onOpenPalette} className="topbar-icon-button md:hidden" aria-label="Search pages, actions, reports, and people" title="Search">
          <Search className="size-[18px]" strokeWidth={1.8} />
        </button>
        <Link href="/inbox" className="topbar-icon-button" aria-label="Open inbox" title="Inbox">
          <Bell className="size-[18px]" strokeWidth={1.8} />
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
