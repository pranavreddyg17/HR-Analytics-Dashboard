"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { AnimatePresence, LayoutGroup } from "motion/react"
import * as m from "motion/react-m"

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
  detail: string
  adminOnly?: boolean
}

const navigationGroups: Array<{ label: string; items: NavigationItem[] }> = [
  {
    label: "Work",
    items: [
      { href: "/", label: "Home", detail: "Priorities and upcoming people work" },
      { href: "/people", label: "People", detail: "Employee directory and records" },
      { href: "/inbox", label: "Work queue", detail: "Requests, decisions, and follow-ups" },
    ],
  },
  {
    label: "Lifecycle",
    items: [
      { href: "/onboarding", label: "Onboarding", detail: "New joiners, headcount, and candidate handoff" },
      { href: "/leaves", label: "Leaves", detail: "Leave requests, schedules, and coverage" },
      { href: "/courses", label: "Learning", detail: "Capability recommendations and assignments" },
      { href: "/exits", label: "Exit management", detail: "Offboarding, tasks, and asset recovery" },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { href: "/insights", label: "Insights", detail: "Workforce movement and department review" },
      { href: "/attrition", label: "Retention risk", detail: "Retention signals and model analysis" },
      { href: "/assistant", label: "AI assistant", detail: "Workforce questions and assisted actions" },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/imports", label: "Data exchange", detail: "Imports, record coverage, and reporting feeds" },
      { href: "/assets", label: "Asset inventory", detail: "Assigned equipment and return status" },
      { href: "/admin", label: "Operations monitor", detail: "Application health, usage, cost, and service performance", adminOnly: true },
      { href: "/access", label: "Access", detail: "Accounts, roles, and access history", adminOnly: true },
    ],
  },
]

function isActive(pathname: string, item: NavigationItem): boolean {
  if (pathname === "/risk-review") return item.href === "/attrition"
  if (pathname === "/hiring") return item.href === "/onboarding"
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
    <LayoutGroup id="hr-primary-navigation">
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
                {active && <m.span layoutId="active-indicator" className="enterprise-nav__indicator" aria-hidden="true" />}
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
                {groupActive && <m.span layoutId="active-indicator" className="enterprise-nav__indicator" aria-hidden="true" />}
                <AnimatePresence>
                {visibleOpenMenu === group.label && <m.div className="enterprise-nav__popover" initial={{ opacity: 0, y: -4, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -3, scale: 0.985 }} transition={{ duration: 0.14 }}>
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
                </m.div>}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      </div>
    </nav>
    </LayoutGroup>
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
  const panelRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0)
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== "Tab" || !panelRef.current) return
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", handleKeyDown)
      previous?.focus()
    }
  }, [onClose, open])

  return (
    <AnimatePresence>
    {open && <m.div className="mobile-navigation-layer" role="dialog" aria-modal="true" aria-label="Application navigation" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <m.button type="button" className="mobile-navigation-backdrop" aria-label="Close navigation" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <m.section ref={panelRef} className="mobile-navigation-panel" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.17 }}>
        <header className="mobile-navigation-header">
          <h2>Navigation</h2>
          <button ref={closeButtonRef} type="button" className="text-button" onClick={onClose}>Close</button>
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
          <div className="flex items-center gap-3">
            <Link href="/employee" onClick={onClose} className="text-button">Employee portal</Link>
            {user.authenticated
              ? <SignOutControl />
              : <span className="text-meta text-muted-foreground">Local session</span>}
          </div>
        </footer>
      </m.section>
    </m.div>}
    </AnimatePresence>
  )
}

export const commandNavigation = navigationGroups.flatMap((group) => group.items)
