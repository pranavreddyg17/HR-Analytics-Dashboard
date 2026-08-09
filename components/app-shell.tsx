"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Search } from "lucide-react"

import {
  AppNavigation,
  commandNavigation,
  MobileNavigation,
  type ShellUser,
} from "@/components/app-navigation"
import { Topbar } from "@/components/topbar"
import { ContextualAiAssistant } from "@/components/contextual-ai-assistant"
import { SessionRevalidator } from "@/components/session-revalidator"
import { cn } from "@/lib/utils"

type PaletteItem = {
  id: string
  href: string
  label: string
  detail: string
  kind: "destination" | "person" | "record"
  section: string
  initials?: string
}

type SearchDestination = {
  id: string
  href: string
  label: string
  detail: string
  keywords: string
  section: "Pages"
  adminOnly?: boolean
}

type WorkspaceSearchResult = Omit<PaletteItem, "kind"> & { kind: "person" | "record" }

const pageDetails: Record<string, string> = {
  "/": "Priorities and upcoming people work",
  "/people": "Employee directory and records",
  "/inbox": "Requests, decisions, and follow-ups",
  "/onboarding": "New joiners, headcount, and candidate handoff",
  "/leaves": "Leave requests, schedules, and coverage",
  "/courses": "Capability recommendations and assignments",
  "/insights": "Workforce movement and department review",
  "/attrition": "Retention signals and model analysis",
  "/assistant": "Workforce questions and assisted actions",
  "/imports": "Imports, record coverage, and reporting feeds",
  "/access": "Accounts, roles, and access history",
}

const searchDestinations: SearchDestination[] = [
  ...commandNavigation.map((item) => ({
    id: `page-${item.href}`,
    href: item.href,
    label: item.label,
    detail: pageDetails[item.href] ?? "Workspace page",
    keywords: `${item.label} ${item.href}`,
    section: "Pages" as const,
    adminOnly: item.adminOnly,
  })),
]

function destinationScore(item: SearchDestination, query: string): number {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return 1
  const label = item.label.toLowerCase()
  const haystack = `${label} ${item.detail} ${item.keywords}`.toLowerCase()
  const words = normalized.split(/\s+/).filter(Boolean)
  if (!words.every((word) => haystack.includes(word))) return -1
  if (label === normalized) return 100
  if (label.startsWith(normalized)) return 80
  if (label.includes(normalized)) return 65
  return 30 + words.filter((word) => label.includes(word)).length * 5
}

function CommandPalette({ onClose, user }: { onClose: () => void; user: ShellUser }) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [records, setRecords] = useState<WorkspaceSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (query.trim().length < 2) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/v1/search?q=${encodeURIComponent(query.trim())}`, { cache: "no-store", signal: controller.signal })
        if (!response.ok) throw new Error("Search unavailable")
        const body = await response.json() as { results?: WorkspaceSearchResult[] }
        setRecords(body.results ?? [])
        setActiveIndex(0)
      } catch (error) {
        if ((error as { name?: string }).name !== "AbortError") setRecords([])
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, 220)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [query])

  const items = useMemo<PaletteItem[]>(() => {
    const normalized = query.trim().toLowerCase()
    const destinations = searchDestinations
      .filter((item) => !item.adminOnly || user.role === "admin")
      .map((item) => ({ item, score: destinationScore(item, normalized) }))
      .filter(({ score }) => score >= 0)
      .sort((left, right) => {
        return right.score - left.score
      })
      .slice(0, normalized ? 5 : 8)
      .map(({ item }) => ({ ...item, kind: "destination" as const }))
    return [...destinations, ...records]
  }, [query, records, user.role])

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
                setRecords([])
                setLoading(false)
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((current) => Math.min(current + 1, Math.max(0, items.length - 1))) }
              if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((current) => Math.max(current - 1, 0)) }
              if (event.key === "Enter" && items[activeIndex]) { event.preventDefault(); select(items[activeIndex]) }
              if (event.key === "Escape") onClose()
            }}
            placeholder="Search people, pages, reports, or actions"
            aria-label="Search"
          />
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        </div>
        <div className="command-results">
          {items.map((item, index) => {
            const beginsSection = index === 0 || items[index - 1]?.section !== item.section
            return (
              <div key={item.id}>
                {beginsSection && <p className="command-section-label mt-2">{!query && item.section === "Pages" ? "Quick navigation" : item.section}</p>}
                <button
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => select(item)}
                  className={cn("command-result", index === activeIndex && "command-result--active")}
                >
                  {item.kind === "person" && <span className="command-result__icon command-result__avatar">{item.initials}</span>}
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
      </section>
    </div>
  )
}

export function AppShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(false)

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setPaletteOpen((current) => !current)
      } else if (event.key === "Escape") {
        setPaletteOpen(false)
        setMobileNavigationOpen(false)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  return (
    <div className="app-frame">
      <SessionRevalidator enabled={user.authenticated} />
      <div className="app-stage">
        <div className="app-header">
          <Topbar
            user={user}
            navigation={<AppNavigation user={user} />}
            onOpenPalette={() => setPaletteOpen(true)}
            onOpenNavigation={() => setMobileNavigationOpen(true)}
          />
        </div>
        <main className="app-content">{children}</main>
      </div>
      {paletteOpen && <CommandPalette user={user} onClose={() => setPaletteOpen(false)} />}
      <MobileNavigation user={user} open={mobileNavigationOpen} onClose={() => setMobileNavigationOpen(false)} />
      <ContextualAiAssistant open={assistantOpen} onOpenChange={setAssistantOpen} />
    </div>
  )
}
