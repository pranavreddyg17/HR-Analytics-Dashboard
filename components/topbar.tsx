"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"

import { BrandLogo } from "@/components/brand-logo"
import type { ShellUser } from "@/components/app-navigation"
import { SignOutControl } from "@/components/sign-out-control"
import { returnDestinationLabel, safeReturnTo } from "@/lib/navigation"

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "HR"
}

export function Topbar({ user, navigation, onOpenPalette, onOpenNavigation }: { user: ShellUser; navigation: React.ReactNode; onOpenPalette: () => void; onOpenNavigation: () => void }) {
  const searchParams = useSearchParams()
  const returnTo = safeReturnTo(searchParams.get("returnTo"))

  return (
    <header className="topbar">
      <div className="topbar__inner">
        <div className="topbar__leading">
          <Link href="/" className="topbar__brand" aria-label="LaidbackHR.AI home">
            <BrandLogo />
          </Link>
          {returnTo && <Link href={returnTo} className="topbar-back-link">Back to {returnDestinationLabel(returnTo)}</Link>}
        </div>

        {navigation}

        <button
          type="button"
          onClick={onOpenPalette}
          className="topbar-search"
          aria-label="Search pages, actions, reports, and people"
        >
          <span className="topbar-search__full">Search workspace records and pages</span>
          <span className="topbar-search__compact">Search</span>
        </button>

        <div className="topbar__utilities">
          <details className="user-menu">
            <summary aria-label="Open account menu">
              <span className="avatar-soft avatar-soft--small">{initials(user.displayName)}</span>
              <span className="user-menu__name">{user.displayName}</span>
            </summary>
            <div className="user-menu__popover">
              <div className="border-b border-border px-3.5 py-3">
                <p className="truncate text-sm font-semibold">{user.displayName}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{user.email}</p>
              </div>
              <Link href="/employee" className="user-menu__item">Employee portal</Link>
              {user.authenticated ? (
                <SignOutControl className="user-menu__item" />
              ) : (
                <p className="px-3.5 py-2.5 text-xs text-muted-foreground">Local development session</p>
              )}
            </div>
          </details>

          <button type="button" className="topbar-menu-button" onClick={onOpenNavigation} aria-label="Open navigation">Menu</button>
        </div>
      </div>
    </header>
  )
}
