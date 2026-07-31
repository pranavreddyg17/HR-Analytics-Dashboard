"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Loader2, Search, UserRound, X } from "lucide-react"

import {
  AppSidebar,
  commandNavigation,
  navigationGroups,
  type NavigationItem,
  type ShellUser,
} from "@/components/app-sidebar"
import { BrandLogo } from "@/components/brand-logo"
import { Topbar } from "@/components/topbar"
import { cn } from "@/lib/utils"

type PersonResult = {
  employee_id: string
  display_name: string
  initials: string
  job_title: string
  department: string
  location: string
}

type PaletteItem = {
  id: string
  href: string
  label: string
  detail: string
  kind: "page" | "person"
  icon?: NavigationItem["icon"]
  initials?: string
}

function matchesNavigation(item: NavigationItem, query: string): boolean {
  const text = `${item.label} ${item.href}`.toLowerCase()
  return text.includes(query.toLowerCase())
}

function MobileMore({ open, onClose, user }: { open: boolean; onClose: () => void; user: ShellUser }) {
  const pathname = usePathname()
  const currentView = useSearchParams().get("view")
  if (!open) return null
  const secondary = navigationGroups.flatMap((group) => group.items).filter((item) => !["/", "/people", "/inbox"].includes(item.href) && (item.href !== "/access" || user.role === "admin"))
  return (
    <div className="mobile-sheet-layer md:hidden" role="dialog" aria-modal="true" aria-label="More navigation">
      <button type="button" className="mobile-sheet-backdrop" aria-label="Close navigation" onClick={onClose} />
      <section className="mobile-sheet">
        <div className="mobile-sheet__handle" aria-hidden="true" />
        <div className="flex items-center justify-between px-5 pb-4 pt-1">
          <BrandLogo />
          <button type="button" onClick={onClose} className="topbar-icon-button" aria-label="Close navigation"><X className="size-5" /></button>
        </div>
        <nav className="grid grid-cols-2 gap-2 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {secondary.map((item) => {
            const Icon = item.icon
            const path = item.href.split("?")[0]
            const active = pathname === path && (path !== "/insights" || (item.view ? currentView === item.view : !currentView || currentView === "executive"))
            return (
              <Link key={item.href} href={item.href} onClick={onClose} className={cn("mobile-more-link", active && "mobile-more-link--active")}>
                <span className="mobile-more-link__icon"><Icon className="size-5" strokeWidth={1.8} /></span>
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>
      </section>
    </div>
  )
}

function CommandPalette({ onClose, user }: { onClose: () => void; user: ShellUser }) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [people, setPeople] = useState<PersonResult[]>([])
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (query.trim().length < 2) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/v1/hr/people?search=${encodeURIComponent(query.trim())}&limit=6`, { signal: controller.signal })
        if (!response.ok) throw new Error("Search unavailable")
        const body = await response.json() as { items?: PersonResult[] }
        setPeople(body.items ?? [])
        setActiveIndex(0)
      } catch (error) {
        if ((error as { name?: string }).name !== "AbortError") setPeople([])
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 220)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [query])

  const items = useMemo<PaletteItem[]>(() => {
    const normalized = query.trim()
    const pages = commandNavigation
      .filter((item) => item.href !== "/access" || user.role === "admin")
      .filter((item) => !normalized || matchesNavigation(item, normalized))
      .slice(0, normalized ? 5 : 8)
      .map((item) => ({ id: `page-${item.href}`, href: item.href, label: item.label, detail: "Page", kind: "page" as const, icon: item.icon }))
    const employees = people.map((person) => ({
      id: `person-${person.employee_id}`,
      href: `/people/${encodeURIComponent(person.employee_id)}`,
      label: person.display_name,
      detail: `${person.job_title} · ${person.department}`,
      kind: "person" as const,
      initials: person.initials,
    }))
    return [...pages, ...employees]
  }, [people, query, user.role])

  function select(item: PaletteItem) {
    onClose()
    router.push(item.href)
  }

  return (
    <div className="command-layer" role="dialog" aria-modal="true" aria-label="Search LaidbackHR.AI">
      <button type="button" className="command-backdrop" onClick={onClose} aria-label="Close search" />
      <section className="command-panel">
        <div className="command-input-row">
          <Search className="size-5 text-muted-foreground" strokeWidth={1.8} />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(event) => {
              const next = event.target.value
              setQuery(next)
              setActiveIndex(0)
              if (next.trim().length < 2) {
                setPeople([])
                setLoading(false)
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((current) => Math.min(current + 1, Math.max(0, items.length - 1))) }
              if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((current) => Math.max(current - 1, 0)) }
              if (event.key === "Enter" && items[activeIndex]) { event.preventDefault(); select(items[activeIndex]) }
              if (event.key === "Escape") onClose()
            }}
            placeholder="Search pages or people"
            aria-label="Search"
          />
          {loading ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : <kbd>ESC</kbd>}
        </div>
        <div className="command-results">
          {!query && <p className="command-section-label">Quick navigation</p>}
          {query && items.some((item) => item.kind === "page") && <p className="command-section-label">Pages</p>}
          {items.map((item, index) => {
            const Icon = item.icon
            const beginsPeople = item.kind === "person" && (index === 0 || items[index - 1]?.kind !== "person")
            return (
              <div key={item.id}>
                {beginsPeople && <p className="command-section-label mt-2">People</p>}
                <button
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => select(item)}
                  className={cn("command-result", index === activeIndex && "command-result--active")}
                >
                  <span className={cn("command-result__icon", item.kind === "person" && "command-result__avatar")}>
                    {item.kind === "person" ? (item.initials || <UserRound className="size-4" />) : Icon && <Icon className="size-[18px]" strokeWidth={1.8} />}
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-sm font-semibold">{item.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{item.detail}</span>
                  </span>
                </button>
              </div>
            )
          })}
          {!loading && query && items.length === 0 && (
            <div className="command-empty">
              <Search className="size-5" />
              <p>No results for {query}.</p>
            </div>
          )}
        </div>
        <footer className="command-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span className="ml-auto">Workspace search</span>
        </footer>
      </section>
    </div>
  )
}

export function AppShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setPaletteOpen((current) => !current)
      } else if (event.key === "Escape") {
        setPaletteOpen(false)
        setMobileMoreOpen(false)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  return (
    <div className="app-frame">
      <AppSidebar
        collapsed={collapsed}
        user={user}
        onToggle={() => setCollapsed((current) => !current)}
        onOpenPalette={() => setPaletteOpen(true)}
        onOpenMobileMore={() => setMobileMoreOpen(true)}
      />
      <div className="app-stage">
        <Topbar user={user} onOpenPalette={() => setPaletteOpen(true)} />
        <main key={pathname} className="app-content">{children}</main>
      </div>
      {paletteOpen && <CommandPalette user={user} onClose={() => setPaletteOpen(false)} />}
      <MobileMore user={user} open={mobileMoreOpen} onClose={() => setMobileMoreOpen(false)} />
    </div>
  )
}
