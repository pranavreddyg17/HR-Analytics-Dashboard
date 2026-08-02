"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Loader2, Search, UserRound, X } from "lucide-react"

import {
  AppSidebar,
  commandNavigation,
  navigationGroups,
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
  kind: "destination" | "person"
  section: string
  initials?: string
}

type SearchDestination = {
  id: string
  href: string
  label: string
  detail: string
  keywords: string
  section: "Pages" | "Actions" | "Reports"
}

const pageDetails: Record<string, string> = {
  "/": "Priorities and upcoming people work",
  "/people": "Employee directory and records",
  "/inbox": "Requests, decisions, and follow-ups",
  "/hiring": "Headcount requests and candidate pipeline",
  "/leaves": "Leave requests, schedules, and coverage",
  "/courses": "Course assignments and due dates",
  "/insights": "Workforce movement and operational exceptions",
  "/attrition": "Retention signals and model analysis",
  "/assistant": "Workforce questions and assisted actions",
  "/imports": "Imports, record coverage, and reporting feeds",
  "/access": "Accounts, roles, and access history",
}

const featureDestinationDefinitions: Array<Omit<SearchDestination, "icon">> = [
  { id: "add-employee", href: "/people?new=employee", label: "Add employee", detail: "Create a new employee profile", keywords: "new member teammate profile onboard hire record", section: "Actions" },
  { id: "mobility-review", href: "/people?tenure=mobility", label: "Mobility review", detail: "Find employees with 3+ years tenure and no promotion", keywords: "tenure promotion career progression stalled people filter", section: "Actions" },
  { id: "request-leave", href: "/inbox?new=leave", label: "Request leave", detail: "Submit a time-off request for an employee", keywords: "annual sick holiday absence time off workflow", section: "Actions" },
  { id: "review-leave", href: "/leaves#pending-decisions", label: "Review pending leave", detail: "Approve or decline outstanding leave requests", keywords: "decision approval reject time off absence manager", section: "Actions" },
  { id: "request-position", href: "/inbox?new=hiring", label: "Request a position", detail: "Create a new hiring request", keywords: "requisition role vacancy headcount job opening", section: "Actions" },
  { id: "assign-training", href: "/inbox?new=training", label: "Assign training", detail: "Create an employee learning assignment", keywords: "course mandatory compliance programme learning", section: "Actions" },
  { id: "review-model-records", href: "/risk-review", label: "Review scored records", detail: "Audit historical attrition model scores", keywords: "attrition risk model high medium low validation", section: "Actions" },
  { id: "import-records", href: "/imports#import-records", label: "Import HR records", detail: "Upload employee or workflow data from CSV", keywords: "data hub csv upload employees hiring leave training promotions", section: "Actions" },
  { id: "power-bi-feeds", href: "/imports#power-bi-feeds", label: "Power BI feeds", detail: "Copy reporting endpoints for Power BI", keywords: "csv endpoint reporting connector copy data feed", section: "Actions" },
  { id: "manage-access", href: "/access", label: "Manage access", detail: "Add, update, or remove workspace accounts", keywords: "allowlist email user role administrator permissions", section: "Actions" },
  { id: "workforce-summary", href: "/insights", label: "Workforce summary", detail: "Review headcount, movement, and completion metrics", keywords: "executive kpi active employees hires exits attrition rate", section: "Reports" },
  { id: "headcount-report", href: "/", label: "Headcount by department", detail: "Compare employee totals across departments", keywords: "overview organization team workforce status employment type manager span", section: "Reports" },
  { id: "hiring-pipeline", href: "/hiring", label: "Hiring pipeline", detail: "Review open demand, velocity, roles, and sources", keywords: "requisition recruitment source performance time to hire job", section: "Reports" },
  { id: "leave-coverage", href: "/leaves", label: "Leave coverage", detail: "Review schedules, leave mix, and department coverage", keywords: "away today coming up approved days annual sick absence", section: "Reports" },
  { id: "learning-compliance", href: "/courses", label: "Learning compliance", detail: "Review incomplete and completed training", keywords: "mandatory overdue assessment programme participation", section: "Reports" },
  { id: "attrition-analysis", href: "/attrition", label: "Attrition analysis", detail: "Review exits, tenure cohorts, and retention priorities", keywords: "turnover resignation voluntary involuntary department risk", section: "Reports" },
  { id: "data-coverage", href: "/imports#data-coverage", label: "Data coverage", detail: "Review record counts by HR domain", keywords: "database records status domains", section: "Reports" },
]

const featureDestinations: SearchDestination[] = featureDestinationDefinitions

const searchDestinations: SearchDestination[] = [
  ...commandNavigation.map((item) => ({
    id: `page-${item.href}`,
    href: item.href,
    label: item.label,
    detail: pageDetails[item.href] ?? "Workspace page",
    keywords: `${item.label} ${item.href}`,
    section: "Pages" as const,
  })),
  ...featureDestinations,
]

function destinationScore(item: SearchDestination, query: string): number {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return item.section === "Pages" ? 1 : 0
  const label = item.label.toLowerCase()
  const haystack = `${label} ${item.detail} ${item.keywords}`.toLowerCase()
  const words = normalized.split(/\s+/).filter(Boolean)
  if (!words.every((word) => haystack.includes(word))) return -1
  if (label === normalized) return 100
  if (label.startsWith(normalized)) return 80
  if (label.includes(normalized)) return 65
  return 30 + words.filter((word) => label.includes(word)).length * 5
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
            const path = item.href.split("?")[0]
            const active = pathname === path && (path !== "/insights" || (item.view ? currentView === item.view : !currentView || currentView === "executive"))
            return (
              <Link key={item.href} href={item.href} onClick={onClose} className={cn("mobile-more-link", active && "mobile-more-link--active")}>
                <item.icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block font-semibold text-foreground">{item.label}</span>
                  <span className="block text-meta text-muted-foreground">{item.description}</span>
                </span>
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
    const normalized = query.trim().toLowerCase()
    const destinations = searchDestinations
      .filter((item) => !item.href.startsWith("/access") || user.role === "admin")
      .map((item) => ({ item, score: destinationScore(item, normalized) }))
      .filter(({ score }) => score >= 0)
      .sort((left, right) => {
        const sectionOrder = { Pages: 0, Actions: 1, Reports: 2 }
        return normalized
          ? sectionOrder[left.item.section] - sectionOrder[right.item.section] || right.score - left.score
          : right.score - left.score
      })
      .slice(0, normalized ? 12 : 8)
      .map(({ item }) => ({ ...item, kind: "destination" as const }))
    const employees = people.map((person) => ({
      id: `person-${person.employee_id}`,
      href: `/people/${encodeURIComponent(person.employee_id)}`,
      label: person.display_name,
      detail: `${person.job_title} · ${person.department}`,
      kind: "person" as const,
      section: "People",
      initials: person.initials,
    }))
    return [...destinations, ...employees]
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
                  {item.kind === "person" && <span className="command-result__icon command-result__avatar">{item.initials || <UserRound className="size-4" />}</span>}
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
  const pathname = usePathname()
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
        user={user}
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
