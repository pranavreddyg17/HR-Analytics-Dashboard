"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"

import { BrandLogo } from "@/components/brand-logo"
import { cn } from "@/lib/utils"

export type ShellUser = {
  displayName: string
  email: string
  authenticated: boolean
  role?: string
}

export type NavigationItem = {
  href: string
  label: string
  view?: string
}

export const navigationGroups: Array<{ label: string; items: NavigationItem[] }> = [
  {
    label: "Core",
    items: [
      { href: "/", label: "Home" },
      { href: "/people", label: "People" },
      { href: "/inbox", label: "Inbox" },
    ],
  },
  {
    label: "Workflows",
    items: [
      { href: "/hiring", label: "Hiring" },
      { href: "/time-off", label: "Leaves" },
      { href: "/learning", label: "Assign Courses" },
    ],
  },
  {
    label: "Reporting",
    items: [
      { href: "/insights", label: "Insights" },
      { href: "/attrition", label: "Attrition risk" },
      { href: "/ai-agents", label: "AI Assistant" },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/data", label: "Import / Export Data" },
      { href: "/access", label: "Access" },
    ],
  },
]

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "HR"
}

function isActive(pathname: string, currentView: string | null, item: NavigationItem): boolean {
  const path = item.href.split("?")[0]
  if (path === "/") return pathname === "/"
  if (path !== pathname) return false
  if (path !== "/insights") return true
  if (item.view) return currentView === item.view
  return !currentView || currentView === "executive"
}

export function AppSidebar({
  user,
  onOpenMobileMore,
}: {
  user: ShellUser
  onOpenMobileMore: () => void
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentView = searchParams.get("view")

  return (
    <>
      <aside
        className="sticky top-0 z-30 hidden h-dvh w-[252px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex"
      >
        <div className="flex h-[72px] items-center border-b border-sidebar-border px-5">
          <Link href="/" className="min-w-0" aria-label="LaidbackHR.AI home">
            <BrandLogo />
          </Link>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-4 py-3" aria-label="Primary navigation">
          {navigationGroups.map((group) => (
            <div key={group.label} className="mb-4">
              <p className="sidebar-group-label">{group.label}</p>
              <div className="space-y-1">
                {group.items.filter((item) => item.href !== "/access" || user.role === "admin").map((item) => {
                  const active = isActive(pathname, currentView, item)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn("sidebar-nav-item", active && "sidebar-nav-item--active")}
                    >
                      <span className="truncate">{item.label}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-sidebar-border p-4">
          <div className="flex items-center gap-3 rounded-md bg-sidebar-accent/65 p-2.5">
            <span className="avatar-soft" title={user.displayName}>{initials(user.displayName)}</span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-semibold text-sidebar-foreground">{user.displayName}</span>
              <span className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
                <span className="capitalize">{user.role ?? "member"}</span> · Google
              </span>
            </span>
          </div>
        </div>
      </aside>

      <nav className="mobile-dock" aria-label="Mobile navigation">
        {[
          { href: "/", label: "Home" },
          { href: "/people", label: "People" },
          { href: "/inbox", label: "Inbox" },
        ].map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
          return (
            <Link key={item.href} href={item.href} className={cn("mobile-dock__item", active && "mobile-dock__item--active")} aria-current={active ? "page" : undefined}>
              <span>{item.label}</span>
            </Link>
          )
        })}
        <button
          type="button"
          onClick={onOpenMobileMore}
          className={cn("mobile-dock__item", !["/", "/people", "/inbox"].some((route) => route === "/" ? pathname === route : pathname.startsWith(route)) && "mobile-dock__item--active")}
          aria-label="More navigation"
        >
          <span>More</span>
        </button>
      </nav>
    </>
  )
}

export const commandNavigation = navigationGroups.flatMap((group) => group.items)
