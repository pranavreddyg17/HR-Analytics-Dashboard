"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import {
  BarChart3,
  Bot,
  BriefcaseBusiness,
  ChevronLeft,
  Database,
  GraduationCap,
  House,
  Inbox,
  KeyRound,
  Menu,
  Search,
  ShieldAlert,
  Umbrella,
  Users,
  type LucideIcon,
} from "lucide-react"

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
  icon: LucideIcon
  view?: string
}

export const navigationGroups: Array<{ label: string; items: NavigationItem[] }> = [
  {
    label: "Core",
    items: [
      { href: "/", label: "Overview", icon: House },
      { href: "/people", label: "People", icon: Users },
      { href: "/inbox", label: "Inbox", icon: Inbox },
    ],
  },
  {
    label: "Workflows",
    items: [
      { href: "/hiring", label: "Hiring", icon: BriefcaseBusiness },
      { href: "/time-off", label: "Time off", icon: Umbrella },
      { href: "/learning", label: "Learning", icon: GraduationCap },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { href: "/insights", label: "Insights", icon: BarChart3 },
      { href: "/attrition", label: "Attrition risk", icon: ShieldAlert },
      { href: "/ai-agents", label: "HR assistant", icon: Bot },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/data", label: "Data hub", icon: Database },
      { href: "/access", label: "Access", icon: KeyRound },
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
  collapsed,
  user,
  onToggle,
  onOpenPalette,
  onOpenMobileMore,
}: {
  collapsed: boolean
  user: ShellUser
  onToggle: () => void
  onOpenPalette: () => void
  onOpenMobileMore: () => void
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentView = searchParams.get("view")

  return (
    <>
      <aside
        className={cn(
          "sticky top-0 z-30 hidden h-dvh shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-300 ease-out md:flex",
          collapsed ? "w-[80px]" : "w-[252px]",
        )}
      >
        <div className={cn("flex h-[72px] items-center border-b border-sidebar-border", collapsed ? "justify-center px-3" : "px-5")}>
          <Link href="/" className="min-w-0" aria-label="LaidbackHR.AI home">
            <BrandLogo compact={collapsed} />
          </Link>
        </div>

        {!collapsed && (
          <button type="button" onClick={onOpenPalette} className="sidebar-search" aria-label="Search people and navigate">
            <Search className="size-4" />
            <span>Search anything</span>
            <kbd>⌘ K</kbd>
          </button>
        )}
        {collapsed && (
          <button type="button" onClick={onOpenPalette} className="sidebar-icon-button mx-auto mt-4" aria-label="Search people and navigate">
            <Search className="size-[18px]" />
          </button>
        )}

        <nav className={cn("min-h-0 flex-1 overflow-y-auto py-3", collapsed ? "px-3" : "px-4")} aria-label="Primary navigation">
          {navigationGroups.map((group) => (
            <div key={group.label} className="mb-4">
              {!collapsed && <p className="sidebar-group-label">{group.label}</p>}
              <div className="space-y-1">
                {group.items.filter((item) => item.href !== "/access" || user.role === "admin").map((item) => {
                  const active = isActive(pathname, currentView, item)
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      aria-current={active ? "page" : undefined}
                      className={cn("sidebar-nav-item", collapsed && "justify-center px-0", active && "sidebar-nav-item--active")}
                    >
                      <Icon className="size-[18px]" strokeWidth={1.8} />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className={cn("border-t border-sidebar-border", collapsed ? "p-3" : "p-4")}>
          <div className={cn("flex items-center rounded-xl", collapsed ? "justify-center" : "gap-3 bg-sidebar-accent/65 p-2.5")}>
            <span className="avatar-soft" title={user.displayName}>{initials(user.displayName)}</span>
            {!collapsed && (
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block truncate text-sm font-semibold text-sidebar-foreground">{user.displayName}</span>
                <span className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
                  <span className="capitalize">{user.role ?? "member"}</span> · Google
                </span>
              </span>
            )}
          </div>
          <button type="button" onClick={onToggle} className={cn("sidebar-collapse-button", collapsed && "justify-center px-0")} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            <ChevronLeft className={cn("size-4 transition-transform", collapsed && "rotate-180")} />
            {!collapsed && <span>Collapse sidebar</span>}
          </button>
        </div>
      </aside>

      <nav className="mobile-dock" aria-label="Mobile navigation">
        {[
          { href: "/", label: "Overview", icon: House },
          { href: "/people", label: "People", icon: Users },
          { href: "/inbox", label: "Inbox", icon: Inbox },
        ].map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link key={item.href} href={item.href} className={cn("mobile-dock__item", active && "mobile-dock__item--active")} aria-current={active ? "page" : undefined}>
              <Icon className="size-5" strokeWidth={1.8} />
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
          <Menu className="size-5" strokeWidth={1.8} />
          <span>More</span>
        </button>
      </nav>
    </>
  )
}

export const commandNavigation = navigationGroups.flatMap((group) => group.items)
