"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { Search } from "lucide-react"
import { AnimatePresence } from "motion/react"
import * as m from "motion/react-m"

import type { ShellUser } from "@/components/app-navigation"
import { SignOutControl } from "@/components/sign-out-control"
import { returnDestinationLabel, safeReturnTo } from "@/lib/navigation"

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "HR"
}

export function Topbar({ user, navigation, onOpenPalette, onOpenNavigation }: { user: ShellUser; navigation: React.ReactNode; onOpenPalette: () => void; onOpenNavigation: () => void }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const returnTo = safeReturnTo(searchParams.get("returnTo"))
  const [accountOpenPath, setAccountOpenPath] = useState<string | null>(null)
  const accountOpen = accountOpenPath === pathname
  const accountRef = useRef<HTMLDivElement>(null)
  const accountButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!accountOpen) return
    const closeOutside = (event: PointerEvent) => {
      if (!accountRef.current?.contains(event.target as Node)) setAccountOpenPath(null)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        setAccountOpenPath(null)
        accountButtonRef.current?.focus()
      }
    }
    document.addEventListener("pointerdown", closeOutside)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("pointerdown", closeOutside)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [accountOpen])

  return (
    <header className="topbar">
      <div className="topbar__inner">
        <div className="topbar__navigation-area">
          {returnTo && <Link href={returnTo} className="topbar-back-link">Back to {returnDestinationLabel(returnTo)}</Link>}
          {navigation}
        </div>

        <button
          type="button"
          onClick={onOpenPalette}
          className="topbar-search"
          aria-label="Search pages, actions, reports, and people"
        >
          <Search className="topbar-search__icon" aria-hidden="true" />
          <span className="topbar-search__full">Search workspace records and pages</span>
          <span className="topbar-search__compact">Search</span>
        </button>

        <div className="topbar__utilities">
          <div ref={accountRef} className="user-menu">
            <button ref={accountButtonRef} type="button" className="user-menu__trigger" aria-label="Open account menu" aria-haspopup="menu" aria-expanded={accountOpen} onClick={() => setAccountOpenPath((current) => current === pathname ? null : pathname)}>
              <span className="avatar-soft avatar-soft--small">{initials(user.displayName)}</span>
              <span className="user-menu__name">{user.displayName}</span>
            </button>
            <AnimatePresence>
            {accountOpen && <m.div role="menu" className="user-menu__popover" initial={{ opacity: 0, y: -4, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -3, scale: 0.985 }} transition={{ duration: 0.14 }}>
              <div className="border-b border-border px-3.5 py-3">
                <p className="truncate text-sm font-semibold">{user.displayName}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{user.email}</p>
              </div>
              <Link role="menuitem" href="/employee" className="user-menu__item" onClick={() => setAccountOpenPath(null)}>Employee portal</Link>
              {user.authenticated ? (
                <SignOutControl role="menuitem" className="user-menu__item" />
              ) : (
                <p className="px-3.5 py-2.5 text-xs text-muted-foreground">Local development session</p>
              )}
            </m.div>}
            </AnimatePresence>
          </div>

          <button type="button" className="topbar-menu-button" onClick={onOpenNavigation} aria-label="Open navigation">Menu</button>
        </div>
      </div>
    </header>
  )
}
