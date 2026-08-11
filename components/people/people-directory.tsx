"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Archive, FilterX, Plus, Search, SlidersHorizontal } from "lucide-react"
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { EmployeeDrawer } from "@/components/people/employee-drawer"
import { PersonAvatar, StatusPill } from "@/components/people/people-ui"
import type { EmployeeDirectoryResponse, ManagedEmployee } from "@/lib/people-types"
import { cn } from "@/lib/utils"
import { categoricalChartColors } from "@/lib/chart-theme"
import { WorkspaceHeader, WorkspacePage } from "@/components/workspace-ui"
import { safeReturnTo, withReturnTo } from "@/lib/navigation"

type Filters = {
  department: string
  location: string
  status: string
  employmentType: string
  tenure: string
  includeArchived: boolean
}

const initialFilters: Filters = { department: "", location: "", status: "", employmentType: "", tenure: "", includeArchived: false }
const PAGE_SIZE = 25
const compositionColors = categoricalChartColors
const tenureOptions = [
  { value: "under1", label: "Under 1 year" },
  { value: "1to2", label: "1–2 years" },
  { value: "3to4", label: "3–4 years" },
  { value: "5plus", label: "5+ years" },
  { value: "mobility", label: "Mobility review: 3+ years, no promotion" },
]

function validTenure(value: string | null): string {
  return tenureOptions.some((option) => option.value === value) ? value ?? "" : ""
}

export function PeopleDirectory({ initialData, initialManagerPool }: { initialData: EmployeeDirectoryResponse; initialManagerPool: ManagedEmployee[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialQuery = searchParams.get("q") ?? ""
  const [query, setQuery] = useState(initialQuery)
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery.trim())
  const [filters, setFilters] = useState<Filters>(() => ({
    department: searchParams.get("department") ?? "",
    location: searchParams.get("location") ?? "",
    status: searchParams.get("status") ?? "",
    employmentType: searchParams.get("employmentType") ?? "",
    tenure: validTenure(searchParams.get("tenure")),
    includeArchived: searchParams.get("archived") === "1",
  }))
  const [page, setPage] = useState(() => Math.max(0, (Number(searchParams.get("page") ?? "1") || 1) - 1))
  const [data, setData] = useState<EmployeeDirectoryResponse | null>(initialData)
  const [managerPool] = useState<ManagedEmployee[]>(initialManagerPool)
  const [initialSearchString] = useState(() => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) })
    if (initialQuery.trim()) params.set("search", initialQuery.trim())
    if (filters.department) params.set("department", filters.department)
    if (filters.location) params.set("location", filters.location)
    if (filters.status) params.set("status", filters.status)
    if (filters.employmentType) params.set("employmentType", filters.employmentType)
    if (filters.tenure) params.set("tenure", filters.tenure)
    if (filters.includeArchived) params.set("includeArchived", "true")
    return params.toString()
  })
  const [loadedRequest, setLoadedRequest] = useState<string | null>(`${initialSearchString}:0`)
  const skippedInitialLoad = useRef(false)
  const [retry, setRetry] = useState(0)
  const [error, setError] = useState("")
  const drawerOpen = searchParams.get("new") === "employee"
  const [showFilters, setShowFilters] = useState(() => ["department", "location", "status", "employmentType", "tenure", "archived"].some((key) => Boolean(searchParams.get(key))))

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 220)
    return () => window.clearTimeout(timer)
  }, [query])

  const searchString = useMemo(() => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) })
    if (debouncedQuery) params.set("search", debouncedQuery)
    if (filters.department) params.set("department", filters.department)
    if (filters.location) params.set("location", filters.location)
    if (filters.status) params.set("status", filters.status)
    if (filters.employmentType) params.set("employmentType", filters.employmentType)
    if (filters.tenure) params.set("tenure", filters.tenure)
    if (filters.includeArchived) params.set("includeArchived", "true")
    return params.toString()
  }, [debouncedQuery, filters, page])

  const directoryHref = useMemo(() => {
    const params = new URLSearchParams()
    if (debouncedQuery) params.set("q", debouncedQuery)
    if (filters.department) params.set("department", filters.department)
    if (filters.location) params.set("location", filters.location)
    if (filters.status) params.set("status", filters.status)
    if (filters.employmentType) params.set("employmentType", filters.employmentType)
    if (filters.tenure) params.set("tenure", filters.tenure)
    if (filters.includeArchived) params.set("archived", "1")
    if (page > 0) params.set("page", String(page + 1))
    const returnTo = safeReturnTo(searchParams.get("returnTo"))
    if (returnTo) params.set("returnTo", returnTo)
    return `/people${params.size ? `?${params.toString()}` : ""}`
  }, [debouncedQuery, filters, page, searchParams])

  useEffect(() => {
    const current = `/people${searchParams.size ? `?${searchParams.toString()}` : ""}`
    const params = new URLSearchParams(directoryHref.split("?")[1] ?? "")
    if (drawerOpen) params.set("new", "employee")
    const target = `/people${params.size ? `?${params.toString()}` : ""}`
    if (current !== target) router.replace(target, { scroll: false })
  }, [directoryHref, drawerOpen, router, searchParams])

  useEffect(() => {
    if (!skippedInitialLoad.current) {
      skippedInitialLoad.current = true
      if (searchString === initialSearchString && retry === 0) return
    }
    const controller = new AbortController()
    const requestKey = `${searchString}:${retry}`
    fetch(`/api/v1/hr/people?${searchString}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as EmployeeDirectoryResponse & { error?: string }
        if (!response.ok) throw new Error(body.error ?? "The people directory is unavailable.")
        return body
      })
      .then((body) => { setData(body); setError("") })
      .catch((reason: unknown) => { if ((reason as { name?: string }).name !== "AbortError") setError(reason instanceof Error ? reason.message : "The people directory is unavailable.") })
      .finally(() => { if (!controller.signal.aborted) setLoadedRequest(requestKey) })
    return () => controller.abort()
  }, [initialSearchString, retry, searchString])

  const dimensions = data?.dimensions
  const loading = loadedRequest !== `${searchString}:${retry}`
  const activeFilterCount = Object.entries(filters).filter(([key, value]) => key === "includeArchived" ? value : Boolean(value)).length
  function clearFilters() {
    setQuery("")
    setFilters(initialFilters)
    setPage(0)
  }

  function updateTenure(tenure: string) {
    setFilters((current) => ({ ...current, tenure }))
    setPage(0)
  }

  const openDrawer = useCallback(() => {
    const params = new URLSearchParams(directoryHref.split("?")[1] ?? "")
    params.set("new", "employee")
    router.push(`/people?${params.toString()}`, { scroll: false })
  }, [directoryHref, router])
  const closeDrawer = useCallback(() => {
    router.replace(directoryHref, { scroll: false })
  }, [directoryHref, router])
  const openCreatedEmployee = useCallback((employee: ManagedEmployee) => router.replace(withReturnTo(`/people/${encodeURIComponent(employee.employee_id)}`, directoryHref)), [directoryHref, router])
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE))
  const firstRecord = data?.items.length ? page * PAGE_SIZE + 1 : 0
  const lastRecord = data?.items.length ? firstRecord + data.items.length - 1 : 0

  return (
    <WorkspacePage>
      <WorkspaceHeader
        title="People"
        description="Employee directory and records."
        meta={data ? <>{data.total.toLocaleString()} employees</> : undefined}
        actions={<Button onClick={openDrawer}><Plus className="size-3.5" />Add employee</Button>}
      />

      {data && data.composition.departments.length > 0 && (
        <WorkforceComposition
          rows={data.composition.departments}
          selected={filters.department}
          onSelect={(department) => {
            setFilters((current) => ({ ...current, department: current.department === department ? "" : department }))
            setPage(0)
          }}
        />
      )}

      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <div className="border-b border-border/70 p-3 sm:p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(event) => { setQuery(event.target.value); setPage(0) }} placeholder="Search name, role, email, or employee ID" className="h-9 bg-background pl-10 pr-10" />
              {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted-foreground hover:text-foreground">Clear</button>}
            </div>
            <Button variant={showFilters || activeFilterCount ? "secondary" : "outline"} onClick={() => setShowFilters((current) => !current)}><SlidersHorizontal className="size-3.5" />{activeFilterCount > 0 ? `Filters (${activeFilterCount})` : "Filters"}</Button>
          </div>

          {showFilters && (
            <div className="grid gap-3 pt-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_1.35fr_auto]">
              <FilterSelect label="Department" value={filters.department} options={dimensions?.departments ?? []} allLabel="All departments" onChange={(department) => { setFilters((current) => ({ ...current, department })); setPage(0) }} />
              <FilterSelect label="Location" value={filters.location} options={dimensions?.locations ?? []} allLabel="All locations" onChange={(location) => { setFilters((current) => ({ ...current, location })); setPage(0) }} />
              <FilterSelect label="Status" value={filters.status} options={dimensions?.statuses ?? []} allLabel="All statuses" onChange={(status) => { setFilters((current) => ({ ...current, status })); setPage(0) }} />
              <FilterSelect label="Employment" value={filters.employmentType} options={dimensions?.employmentTypes ?? []} allLabel="All types" onChange={(employmentType) => { setFilters((current) => ({ ...current, employmentType })); setPage(0) }} />
              <FilterSelect label="Tenure" value={filters.tenure} options={tenureOptions} allLabel="All tenure ranges" onChange={updateTenure} />
              <div className="flex items-end gap-2">
                <button type="button" onClick={() => { setFilters((current) => ({ ...current, includeArchived: !current.includeArchived })); setPage(0) }} className={cn("flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-semibold", filters.includeArchived ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:text-foreground")}><Archive className="size-3.5" />Archived</button>
                {activeFilterCount > 0 && <Button type="button" variant="ghost" size="icon" aria-label="Clear filters" onClick={clearFilters}><FilterX className="size-4" /></Button>}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-muted/20 px-4 py-3 sm:px-5">
          <p className="text-xs text-muted-foreground">{loading && !data ? "Loading employee records" : <><span className="font-semibold text-foreground">{data?.total.toLocaleString() ?? 0}</span> matching {data?.total === 1 ? "employee" : "employees"}</>}</p>
          {(debouncedQuery || activeFilterCount > 0) && <button type="button" onClick={clearFilters} className="text-xs font-semibold text-primary hover:underline">Reset view</button>}
        </div>

        <div className="hidden grid-cols-[minmax(250px,1.4fr)_minmax(170px,1fr)_minmax(130px,.7fr)_90px_120px] gap-4 border-b border-border/60 px-5 py-2.5 text-xs font-semibold text-muted-foreground md:grid">
          <span>Employee</span><span>Department</span><span>Location</span><span>Tenure</span><span>Status</span>
        </div>

        <div className="relative min-h-48">
          {loading && data && <div className="absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-primary/10"><div className="h-full w-full animate-pulse bg-primary" /></div>}
          {!data && loading ? <DirectorySkeleton /> : error ? (
            <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-6 text-center"><div><p className="font-semibold">Employee records could not be loaded</p><p className="mt-1 text-sm text-muted-foreground">{error}</p></div><Button variant="outline" onClick={() => setRetry((current) => current + 1)}>Try again</Button></div>
          ) : data?.items.length ? (
            <div>
              {data.items.map((employee) => <PersonRow key={employee.employee_id} employee={employee} returnTo={directoryHref} />)}
            </div>
          ) : (
            <div className="flex min-h-72 flex-col items-center justify-center p-6 text-center"><h3 className="font-semibold">No employees found</h3><p className="mt-1 max-w-sm text-sm text-muted-foreground">Change the search or filters, or add an employee record.</p><div className="mt-4 flex gap-2"><Button variant="outline" onClick={clearFilters}>Reset filters</Button><Button onClick={openDrawer}><Plus className="size-4" />Add employee</Button></div></div>
          )}
        </div>

        {data && data.items.length > 0 && <div className="flex flex-col gap-3 border-t border-border/70 bg-muted/20 px-5 py-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-muted-foreground">{firstRecord.toLocaleString()}–{lastRecord.toLocaleString()} of {data.total.toLocaleString()}</p><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page === 0 || loading} onClick={() => setPage((current) => Math.max(0, current - 1))}>Previous</Button><Button size="sm" variant="outline" disabled={page + 1 >= totalPages || loading} onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}>Next</Button></div></div>}
      </Card>

      <EmployeeDrawer
        open={drawerOpen}
        mode="create"
        managers={managerPool}
        dimensions={{ departments: dimensions?.departments ?? [], locations: dimensions?.locations ?? [] }}
        onClose={closeDrawer}
        onSaved={openCreatedEmployee}
      />
    </WorkspacePage>
  )
}

function WorkforceComposition({
  rows,
  selected,
  onSelect,
}: {
  rows: Array<{ name: string; count: number }>
  selected: string
  onSelect: (department: string) => void
}) {
  const total = rows.reduce((sum, row) => sum + row.count, 0)
  const visible = rows.slice(0, 6)
  const remaining = rows.slice(6).reduce((sum, row) => sum + row.count, 0)
  const data = remaining ? [...visible, { name: "Other", count: remaining }] : visible

  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none">
      <div className="grid items-center gap-3 p-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <div>
          <p className="text-card-title font-semibold">Workforce by department</p>
          <p className="mt-0.5 text-meta text-muted-foreground">Current employee distribution</p>
          <div className="relative mt-2 h-36">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 240, height: 144 }}>
              <PieChart>
                <Pie
                  data={data}
                  dataKey="count"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={61}
                  paddingAngle={1}
                  stroke="var(--card)"
                  strokeWidth={2}
                  onClick={(entry) => {
                    const name = String((entry as { name?: unknown }).name ?? "")
                    if (name && name !== "Other") onSelect(name)
                  }}
                >
                  {data.map((row, index) => (
                    <Cell
                      key={row.name}
                      fill={compositionColors[index % compositionColors.length]}
                      opacity={!selected || selected === row.name ? 1 : 0.35}
                      style={{ cursor: row.name === "Other" ? "default" : "pointer" }}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-lg font-semibold tabular-nums">{total.toLocaleString()}</span>
              <span className="text-status text-muted-foreground">Employees</span>
            </div>
          </div>
        </div>
        <div className="grid gap-x-5 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((row, index) => {
            const share = total ? Math.round((row.count / total) * 100) : 0
            const active = selected === row.name
            return (
              <button
                key={row.name}
                type="button"
                disabled={row.name === "Other"}
                onClick={() => onSelect(row.name)}
                className={cn(
                  "grid grid-cols-[8px_minmax(0,1fr)_auto] items-center gap-2 border-b border-border/60 py-2 text-left",
                  row.name !== "Other" && "hover:text-primary",
                  active && "text-primary",
                )}
              >
                <span className="size-2 rounded-sm" style={{ backgroundColor: compositionColors[index % compositionColors.length] }} />
                <span className="truncate text-xs">{row.name}</span>
                <span className="text-meta tabular-nums text-muted-foreground">{row.count.toLocaleString()} · {share}%</span>
              </button>
            )
          })}
        </div>
      </div>
    </Card>
  )
}

function FilterSelect({ label, value, options, allLabel, onChange }: { label: string; value: string; options: Array<string | { value: string; label: string }>; allLabel: string; onChange: (value: string) => void }) {
  return <label className="block"><span className="mb-1 block text-meta font-semibold text-muted-foreground">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"><option value="">{allLabel}</option>{options.map((option) => { const item = typeof option === "string" ? { value: option, label: option } : option; return <option key={item.value} value={item.value}>{item.label}</option> })}</select></label>
}

function PersonRow({ employee, returnTo }: { employee: ManagedEmployee; returnTo: string }) {
  return (
      <Link href={withReturnTo(`/people/${encodeURIComponent(employee.employee_id)}`, returnTo)} className={cn("group grid gap-3 border-b border-border/55 px-4 py-3 last:border-b-0 hover:bg-muted/25 sm:px-5 md:grid-cols-[minmax(250px,1.4fr)_minmax(170px,1fr)_minmax(130px,.7fr)_90px_120px] md:items-center md:gap-4", employee.archived_at && "opacity-65")}>
        <div className="flex min-w-0 items-center gap-3.5">
          <PersonAvatar employeeId={employee.employee_id} initials={employee.initials} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold group-hover:text-primary">{employee.display_name}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{employee.job_title} · {employee.employee_id}</p>
          </div>
        </div>
        <div className="truncate text-sm">{employee.department}</div>
        <div className="truncate text-sm text-muted-foreground">{employee.location}</div>
        <span className="text-sm tabular-nums text-muted-foreground">{employee.tenure_years.toFixed(1)} yrs</span>
        <div className="flex items-center gap-2"><StatusPill status={employee.employment_status} />{employee.archived_at && <Archive className="size-3.5 text-muted-foreground" />}</div>
      </Link>
  )
}

function DirectorySkeleton() {
  return <div>{Array.from({ length: 7 }, (_, index) => <div key={index} className="grid grid-cols-[auto_1fr] gap-3 border-b border-border/60 px-5 py-4 md:grid-cols-[auto_1.3fr_1fr_.7fr_130px]"><div className="size-11 animate-pulse rounded-full bg-muted" /><div className="space-y-2"><div className="h-3.5 w-36 animate-pulse rounded bg-muted" /><div className="h-3 w-52 animate-pulse rounded bg-muted" /></div><div className="hidden h-4 w-28 animate-pulse rounded bg-muted md:block" /><div className="hidden h-4 w-20 animate-pulse rounded bg-muted md:block" /><div className="hidden h-6 w-20 animate-pulse rounded-full bg-muted md:block" /></div>)}</div>
}
