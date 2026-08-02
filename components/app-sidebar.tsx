"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { Activity, ArrowUpDown, BriefcaseBusiness, CalendarDays, ChartNoAxesCombined, GraduationCap, House, ListChecks, MessageSquareText, ShieldCheck, Users, type LucideIcon } from "lucide-react"

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
  description: string
  icon: LucideIcon
  view?: string
}

export const navigationGroups: Array<{ label: string; items: NavigationItem[] }> = [
  {
    label: "Workspace",
    items: [
      { href: "/", label: "Home", description: "Priorities", icon: House },
      { href: "/people", label: "People", description: "Directory", icon: Users },
      { href: "/inbox", label: "Inbox", description: "Approvals", icon: ListChecks },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/hiring", label: "Hiring", description: "Recruiting", icon: BriefcaseBusiness },
      { href: "/leaves", label: "Leaves", description: "Requests", icon: CalendarDays },
      { href: "/courses", label: "Assign courses", description: "Compliance", icon: GraduationCap },
    ],
  },
  {
    label: "Analysis",
    items: [
      { href: "/insights", label: "Insights", description: "Workforce BI", icon: ChartNoAxesCombined },
      { href: "/attrition", label: "Attrition risk", description: "Retention", icon: Activity },
      { href: "/assistant", label: "AI assistant", description: "Analysis", icon: MessageSquareText },
    ],
  },
  {
    label: "Settings",
    items: [
      { href: "/imports", label: "Import / export data", description: "Data exchange", icon: ArrowUpDown },
      { href: "/access", label: "Access", description: "Permissions", icon: ShieldCheck },
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
        className="sticky top-0 z-30 hidden h-dvh w-[232px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex"
      >
        <div className="flex h-16 items-center border-b border-sidebar-border px-4">
          <Link href="/" className="min-w-0" aria-label="LaidbackHR.AI home">
            <BrandLogo />
          </Link>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5" aria-label="Primary navigation">
          {navigationGroups.map((group) => (
            <div key={group.label} className="mb-3">
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
                      <item.icon className="sidebar-nav-item__icon" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{item.label}</span>
                        <span className="sidebar-nav-item__description">{item.description}</span>
                      </span>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3 rounded-md bg-sidebar-accent/65 p-2.5">
            <span className="avatar-soft" title={user.displayName}>{initials(user.displayName)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-sidebar-foreground">{user.displayName}</span>
              <span className="mt-0.5 flex items-center gap-1.5 truncate text-meta text-muted-foreground">
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
