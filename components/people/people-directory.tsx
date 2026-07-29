"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import { Archive, ArrowUpRight, Building2, Database, FilterX, MapPin, Plus, Search, SlidersHorizontal, UsersRound } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { EmployeeDrawer } from "@/components/people/employee-drawer"
import { PersonAvatar, SourcePill, StatusPill, plural } from "@/components/people/people-ui"
import { apiBaseUrl } from "@/lib/api"
import type { EmployeeDirectoryResponse, ManagedEmployee } from "@/lib/people-types"
import { cn } from "@/lib/utils"

type Filters = {
  department: string
  location: string
  status: string
  employmentType: string
  includeArchived: boolean
}

const initialFilters: Filters = { department: "", location: "", status: "", employmentType: "", includeArchived: false }

export function PeopleDirectory() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const reduceMotion = useReducedMotion()
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [filters, setFilters] = useState<Filters>(initialFilters)
  const [data, setData] = useState<EmployeeDirectoryResponse | null>(null)
  const [managerPool, setManagerPool] = useState<ManagedEmployee[]>([])
  const [loadedRequest, setLoadedRequest] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [error, setError] = useState("")
  const [drawerOpen, setDrawerOpen] = useState(() => searchParams.get("new") === "employee")
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 220)
    return () => window.clearTimeout(timer)
  }, [query])

  const searchString = useMemo(() => {
    const params = new URLSearchParams({ limit: "250" })
    if (debouncedQuery) params.set("search", debouncedQuery)
    if (filters.department) params.set("department", filters.department)
    if (filters.location) params.set("location", filters.location)
    if (filters.status) params.set("status", filters.status)
    if (filters.employmentType) params.set("employmentType", filters.employmentType)
    if (filters.includeArchived) params.set("includeArchived", "true")
    return params.toString()
  }, [debouncedQuery, filters])

  useEffect(() => {
    const controller = new AbortController()
    const requestKey = `${searchString}:${retry}`
    fetch(`${apiBaseUrl}/api/v1/hr/people?${searchString}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as EmployeeDirectoryResponse & { error?: string }
        if (!response.ok) throw new Error(body.error ?? "The people directory is unavailable.")
        return body
      })
      .then((body) => { setData(body); setError("") })
      .catch((reason: unknown) => { if ((reason as { name?: string }).name !== "AbortError") setError(reason instanceof Error ? reason.message : "The people directory is unavailable.") })
      .finally(() => { if (!controller.signal.aborted) setLoadedRequest(requestKey) })
    return () => controller.abort()
  }, [retry, searchString])

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${apiBaseUrl}/api/v1/hr/people?limit=250`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<EmployeeDirectoryResponse> : null)
      .then((body) => { if (body) setManagerPool(body.items) })
      .catch(() => undefined)
    return () => controller.abort()
  }, [])

  const dimensions = data?.dimensions
  const loading = loadedRequest !== `${searchString}:${retry}`
  const activeFilterCount = Object.entries(filters).filter(([key, value]) => key === "includeArchived" ? value : Boolean(value)).length
  const demoCount = data?.items.filter((employee) => employee.data_source === "demo").length ?? 0

  function clearFilters() {
    setQuery("")
    setFilters(initialFilters)
  }

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false)
    if (searchParams.get("new") === "employee") router.replace("/people", { scroll: false })
  }, [router, searchParams])
  const openCreatedEmployee = useCallback((employee: ManagedEmployee) => router.push(`/people/${encodeURIComponent(employee.employee_id)}`), [router])

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-5">
      <section className="relative overflow-hidden rounded-[28px] border border-border/70 bg-card px-5 py-6 shadow-sm sm:px-7 sm:py-7">
        <div className="pointer-events-none absolute -right-16 -top-32 size-80 rounded-full bg-primary/[0.07] blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 size-56 rounded-full bg-emerald-400/[0.06] blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary"><UsersRound className="size-3.5" />People directory</div>
            <h2 className="text-balance text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">Know your people.<br className="hidden sm:block" /> Support them better.</h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">A living home for every employee—from their first day to every role, leave request, and growth milestone.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-2 hidden items-center gap-5 border-r border-border pr-5 xl:flex">
              <MiniStat value={data?.total ?? 0} label="People" />
              <MiniStat value={dimensions?.departments.length ?? 0} label="Teams" />
              <MiniStat value={dimensions?.locations.length ?? 0} label="Locations" />
            </div>
            <Button size="lg" className="h-11 rounded-xl px-4 shadow-sm" onClick={() => setDrawerOpen(true)}><Plus className="size-4" />Add employee</Button>
          </div>
        </div>
      </section>

      {demoCount > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/70 px-4 py-3 dark:border-amber-900/60 dark:bg-amber-950/20 sm:flex-row sm:items-center">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"><Database className="size-4" /></span>
          <div className="flex-1"><p className="text-sm font-semibold">Sample team data is on</p><p className="text-xs leading-relaxed text-muted-foreground">Demo records stay clearly marked, so your team can explore safely before importing or adding real employees.</p></div>
          <SourcePill source="demo" />
        </div>
      )}

      <Card className="gap-0 overflow-hidden rounded-[24px] border-border/70 shadow-sm">
        <div className="border-b border-border/70 p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, role, email, or employee ID…" className="h-11 rounded-xl border-border/80 bg-muted/30 pl-10 pr-10" />
              {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground hover:text-foreground">Clear</button>}
            </div>
            <Button variant={showFilters || activeFilterCount ? "secondary" : "outline"} size="lg" className="h-11 rounded-xl px-4" onClick={() => setShowFilters((current) => !current)}><SlidersHorizontal className="size-4" />Filters{activeFilterCount > 0 && <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">{activeFilterCount}</span>}</Button>
          </div>

          <motion.div initial={false} animate={{ height: showFilters ? "auto" : 0, opacity: showFilters ? 1 : 0 }} transition={{ duration: reduceMotion ? 0 : 0.2 }} className="overflow-hidden">
            <div className="grid gap-3 pt-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto]">
              <FilterSelect label="Department" value={filters.department} options={dimensions?.departments ?? []} allLabel="All departments" onChange={(department) => setFilters((current) => ({ ...current, department }))} />
              <FilterSelect label="Location" value={filters.location} options={dimensions?.locations ?? []} allLabel="All locations" onChange={(location) => setFilters((current) => ({ ...current, location }))} />
              <FilterSelect label="Status" value={filters.status} options={dimensions?.statuses ?? []} allLabel="All statuses" onChange={(status) => setFilters((current) => ({ ...current, status }))} />
              <FilterSelect label="Employment" value={filters.employmentType} options={dimensions?.employmentTypes ?? []} allLabel="All types" onChange={(employmentType) => setFilters((current) => ({ ...current, employmentType }))} />
              <div className="flex items-end gap-2">
                <button type="button" onClick={() => setFilters((current) => ({ ...current, includeArchived: !current.includeArchived }))} className={cn("flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-medium transition", filters.includeArchived ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:text-foreground")}><Archive className="size-3.5" />Archived</button>
                {activeFilterCount > 0 && <Button type="button" variant="ghost" size="icon-lg" aria-label="Clear filters" onClick={clearFilters}><FilterX className="size-4" /></Button>}
              </div>
            </div>
          </motion.div>
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 sm:px-5">
          <p className="text-xs text-muted-foreground">{loading && !data ? "Loading your team…" : <><span className="font-semibold text-foreground">{data?.total.toLocaleString() ?? 0}</span> matching {data?.total === 1 ? "person" : "people"}</>}</p>
          {(debouncedQuery || activeFilterCount > 0) && <button type="button" onClick={clearFilters} className="text-xs font-semibold text-primary hover:underline">Reset view</button>}
        </div>

        <div className="hidden grid-cols-[minmax(280px,1.5fr)_minmax(190px,1fr)_minmax(150px,.7fr)_130px_36px] gap-4 border-b border-border/60 px-5 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground md:grid">
          <span>Employee</span><span>Team</span><span>Location</span><span>Status</span><span />
        </div>

        <div className="relative min-h-48">
          {loading && data && <div className="absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-primary/10"><motion.div className="h-full w-1/3 bg-primary" animate={{ x: ["-120%", "340%"] }} transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }} /></div>}
          {!data && loading ? <DirectorySkeleton /> : error ? (
            <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-6 text-center"><span className="flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive"><UsersRound className="size-5" /></span><div><p className="font-semibold">We couldn&apos;t load your people</p><p className="mt-1 text-sm text-muted-foreground">{error}</p></div><Button variant="outline" onClick={() => setRetry((current) => current + 1)}>Try again</Button></div>
          ) : data?.items.length ? (
            <motion.div initial="hidden" animate="shown" variants={{ hidden: {}, shown: { transition: { staggerChildren: reduceMotion ? 0 : 0.025 } } }}>
              {data.items.map((employee) => <PersonRow key={employee.employee_id} employee={employee} />)}
            </motion.div>
          ) : (
            <div className="flex min-h-72 flex-col items-center justify-center p-6 text-center"><span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Search className="size-5" /></span><h3 className="mt-4 font-semibold">No one matches this view</h3><p className="mt-1 max-w-sm text-sm text-muted-foreground">Try a broader search or reset the filters. If this is a new workspace, add your first employee.</p><div className="mt-4 flex gap-2"><Button variant="outline" onClick={clearFilters}>Reset filters</Button><Button onClick={() => setDrawerOpen(true)}><Plus className="size-4" />Add employee</Button></div></div>
          )}
        </div>

        {data && data.items.length > 0 && <div className="flex flex-col gap-1 border-t border-border/70 bg-muted/20 px-5 py-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-muted-foreground">Showing {plural(data.items.length, "person")}{data.total > data.items.length ? ` of ${data.total.toLocaleString()}` : ""}</p>{data.total > 250 && <p className="text-xs text-muted-foreground">Refine your search to find anyone beyond this view.</p>}</div>}
      </Card>

      <EmployeeDrawer
        open={drawerOpen}
        mode="create"
        managers={managerPool}
        dimensions={{ departments: dimensions?.departments ?? [], locations: dimensions?.locations ?? [] }}
        onClose={closeDrawer}
        onSaved={openCreatedEmployee}
      />
    </div>
  )
}

function MiniStat({ value, label }: { value: number; label: string }) {
  return <div><p className="text-xl font-semibold tracking-tight tabular-nums">{value.toLocaleString()}</p><p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">{label}</p></div>
}

function FilterSelect({ label, value, options, allLabel, onChange }: { label: string; value: string; options: string[]; allLabel: string; onChange: (value: string) => void }) {
  return <label className="block"><span className="mb-1.5 block text-[11px] font-semibold text-muted-foreground">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"><option value="">{allLabel}</option>{options.map((option) => <option key={option}>{option}</option>)}</select></label>
}

function PersonRow({ employee }: { employee: ManagedEmployee }) {
  return (
    <motion.div variants={{ hidden: { opacity: 0, y: 7 }, shown: { opacity: 1, y: 0 } }} transition={{ duration: 0.22 }}>
      <Link href={`/people/${encodeURIComponent(employee.employee_id)}`} className={cn("group grid gap-3 border-b border-border/55 px-4 py-4 transition-colors last:border-b-0 hover:bg-primary/[0.035] sm:px-5 md:grid-cols-[minmax(280px,1.5fr)_minmax(190px,1fr)_minmax(150px,.7fr)_130px_36px] md:items-center md:gap-4", employee.archived_at && "opacity-65")}>
        <div className="flex min-w-0 items-center gap-3.5">
          <PersonAvatar employeeId={employee.employee_id} initials={employee.initials} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-semibold tracking-tight group-hover:text-primary">{employee.display_name}</p>{employee.data_source === "demo" && <SourcePill source="demo" />}</div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{employee.job_title} · {employee.employee_id}</p>
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-2 text-sm"><span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Building2 className="size-3.5" /></span><span className="truncate">{employee.department}</span></div>
        <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground"><MapPin className="size-3.5 shrink-0" /><span className="truncate">{employee.location}</span></div>
        <div className="flex items-center gap-2"><StatusPill status={employee.employment_status} />{employee.archived_at && <Archive className="size-3.5 text-muted-foreground" />}</div>
        <span className="hidden size-8 items-center justify-center rounded-lg text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:bg-primary/10 group-hover:text-primary md:flex"><ArrowUpRight className="size-4" /></span>
      </Link>
    </motion.div>
  )
}

function DirectorySkeleton() {
  return <div>{Array.from({ length: 7 }, (_, index) => <div key={index} className="grid grid-cols-[auto_1fr] gap-3 border-b border-border/60 px-5 py-4 md:grid-cols-[auto_1.3fr_1fr_.7fr_130px]"><div className="size-11 animate-pulse rounded-full bg-muted" /><div className="space-y-2"><div className="h-3.5 w-36 animate-pulse rounded bg-muted" /><div className="h-3 w-52 animate-pulse rounded bg-muted" /></div><div className="hidden h-4 w-28 animate-pulse rounded bg-muted md:block" /><div className="hidden h-4 w-20 animate-pulse rounded bg-muted md:block" /><div className="hidden h-6 w-20 animate-pulse rounded-full bg-muted md:block" /></div>)}</div>
}
