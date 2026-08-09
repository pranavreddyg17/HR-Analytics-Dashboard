"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { SignOutControl } from "@/components/sign-out-control"
import { cn } from "@/lib/utils"

export type ShellUser = {
  displayName: string
  email: string
  authenticated: boolean
  role?: string
}

type NavigationItem = {
  href: string
  label: string
  adminOnly?: boolean
}

const navigationGroups: Array<{ label: string; items: NavigationItem[] }> = [
  {
    label: "Workspace",
    items: [
      { href: "/", label: "Home" },
      { href: "/people", label: "People" },
      { href: "/inbox", label: "Inbox" },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/hiring", label: "Hiring" },
      { href: "/leaves", label: "Leaves" },
      { href: "/courses", label: "Assign courses" },
    ],
  },
  {
    label: "Reporting",
    items: [
      { href: "/insights", label: "Insights" },
      { href: "/attrition", label: "Attrition risk" },
      { href: "/assistant", label: "AI assistant" },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/imports", label: "Import / export data" },
      { href: "/access", label: "Access", adminOnly: true },
    ],
  },
]

function isActive(pathname: string, item: NavigationItem): boolean {
  if (pathname === "/risk-review") return item.href === "/attrition"
  if (item.href === "/") return pathname === "/"
  return pathname === item.href || pathname.startsWith(`${item.href}/`)
}

function visibleItems(user: ShellUser, items: NavigationItem[]) {
  return items.filter((item) => !item.adminOnly || user.role === "admin")
}

export function AppNavigation({ user }: { user: ShellUser }) {
  const pathname = usePathname()
  const [workspace, ...menus] = navigationGroups
  const [openMenu, setOpenMenu] = useState({ label: "", path: pathname })
  const navigationRef = useRef<HTMLElement>(null)
  const visibleOpenMenu = openMenu.path === pathname ? openMenu.label : ""

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!navigationRef.current?.contains(event.target as Node)) setOpenMenu({ label: "", path: pathname })
    }
    document.addEventListener("pointerdown", closeOutside)
    return () => document.removeEventListener("pointerdown", closeOutside)
  }, [pathname])

  return (
    <nav ref={navigationRef} className="enterprise-nav" aria-label="Primary navigation">
      <div className="enterprise-nav__inner">
        <div className="enterprise-nav__primary" aria-label={workspace.label}>
          {visibleItems(user, workspace.items).map((item) => {
            const active = isActive(pathname, item)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn("enterprise-nav__link", active && "enterprise-nav__link--active")}
              >
                {item.label}
              </Link>
            )
          })}
        </div>
        <div className="enterprise-nav__menus">
          {menus.map((group) => {
            const items = visibleItems(user, group.items)
            const groupActive = items.some((item) => isActive(pathname, item))
            if (!items.length) return null
            return (
              <div className={cn("enterprise-nav__menu", groupActive && "enterprise-nav__menu--active", visibleOpenMenu === group.label && "enterprise-nav__menu--open")} key={group.label}>
                <button type="button" aria-expanded={visibleOpenMenu === group.label} onClick={() => setOpenMenu((current) => ({ label: current.path === pathname && current.label === group.label ? "" : group.label, path: pathname }))}>{group.label}</button>
                {visibleOpenMenu === group.label && <div className="enterprise-nav__popover">
                  {items.map((item) => {
                    const active = isActive(pathname, item)
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn("enterprise-nav__popover-link", active && "enterprise-nav__popover-link--active")}
                        onClick={() => setOpenMenu({ label: "", path: pathname })}
                      >
                        {item.label}
                      </Link>
                    )
                  })}
                </div>}
              </div>
            )
          })}
        </div>
      </div>
    </nav>
  )
}

export function MobileNavigation({
  open,
  onClose,
  user,
}: {
  open: boolean
  onClose: () => void
  user: ShellUser
}) {
  const pathname = usePathname()

  if (!open) return null

  return (
    <div className="mobile-navigation-layer" role="dialog" aria-modal="true" aria-label="Application navigation">
      <button type="button" className="mobile-navigation-backdrop" aria-label="Close navigation" onClick={onClose} />
      <section className="mobile-navigation-panel">
        <header className="mobile-navigation-header">
          <h2>Navigation</h2>
          <button type="button" className="text-button" onClick={onClose}>Close</button>
        </header>
        <nav className="mobile-navigation-content" aria-label="Mobile navigation">
          {navigationGroups.map((group) => (
            <section key={group.label} className="mobile-navigation-group">
              <h3>{group.label}</h3>
              <div>
                {visibleItems(user, group.items).map((item) => {
                  const active = isActive(pathname, item)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onClose}
                      aria-current={active ? "page" : undefined}
                      className={cn("mobile-navigation-link", active && "mobile-navigation-link--active")}
                    >
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            </section>
          ))}
        </nav>
        <footer className="mobile-navigation-account">
          <div className="min-w-0">
            <p className="truncate font-semibold">{user.displayName}</p>
            <p className="truncate text-meta text-muted-foreground">{user.email}</p>
          </div>
          {user.authenticated
            ? <SignOutControl />
            : <span className="text-meta text-muted-foreground">Local session</span>}
        </footer>
      </section>
    </div>
  )
}

export const commandNavigation = navigationGroups.flatMap((group) => group.items)
