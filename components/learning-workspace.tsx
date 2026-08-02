"use client"

import { useEffect, useMemo, useState } from "react"
import { LoaderCircle, Plus, Search, X } from "lucide-react"

import { SelectEmployee } from "@/components/workflow-creator"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatWorkspaceDateTime } from "@/lib/date-format"
import type { TrainingRecord, WorkforceAnalytics } from "@/lib/hr-types"
import type { ManagedEmployee, WorkflowActorContext } from "@/lib/people-types"
import { cn } from "@/lib/utils"

const inputClass = "h-9 w-full rounded-md border border-border bg-background px-3 text-control outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
const textareaClass = "min-h-24 w-full resize-y rounded-md border border-border bg-background px-3 py-2.5 text-control outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"

function defaultDueDate(): string {
  const date = new Date()
  date.setDate(date.getDate() + 14)
  return date.toISOString().slice(0, 10)
}

function dateLabel(value?: string | null): string {
  if (!value) return "No due date"
  const date = new Date(`${value}T00:00:00`)
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date)
    : value
}

function isMandatory(row: TrainingRecord): boolean {
  return /security|safety/i.test(row.training_program)
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-label font-semibold">{label}</span>
      {children}
    </label>
  )
}

export function LearningWorkspace({ actor, people }: { actor: WorkflowActorContext; people: ManagedEmployee[] }) {
  const assignablePeople = useMemo(
    () => actor.role === "manager" ? people.filter((person) => person.manager_id === actor.employeeId) : people,
    [actor, people],
  )
  const [department, setDepartment] = useState("")
  const [data, setData] = useState<WorkforceAnalytics | null>(null)
  const [loadedQuery, setLoadedQuery] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [query, setQuery] = useState("")
  const [assignOpen, setAssignOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")
  const [assignment, setAssignment] = useState({
    employeeId: assignablePeople[0]?.employee_id ?? "",
    program: "",
    dueDate: defaultDueDate(),
    hours: "2",
    note: "",
  })
  const requestQuery = useMemo(() => {
    const params = new URLSearchParams({ dataMode: "live" })
    if (department) params.set("department", department)
    return params.toString()
  }, [department])
  const loading = loadedQuery !== requestQuery

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/v1/workforce?${requestQuery}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Learning data could not be loaded.")
        return response.json() as Promise<WorkforceAnalytics>
      })
      .then((result) => {
        setData(result)
        setLoadedQuery(requestQuery)
        setError("")
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError") {
          setError(reason instanceof Error ? reason.message : "Learning data could not be loaded.")
          setLoadedQuery(requestQuery)
        }
      })
    return () => controller.abort()
  }, [refreshKey, requestQuery])

  const names = useMemo(() => new Map(people.map((person) => [person.employee_id, person.display_name])), [people])
  const today = new Date().toISOString().slice(0, 10)
  const dueSoonDate = useMemo(() => {
    const date = new Date()
    date.setDate(date.getDate() + 14)
    return date.toISOString().slice(0, 10)
  }, [])
  const incomplete = useMemo(
    () => (data?.training.rows ?? [])
      .filter((row) => row.completion_status.toLowerCase() !== "completed")
      .sort((left, right) => (left.due_date ?? "9999").localeCompare(right.due_date ?? "9999")),
    [data],
  )
  const completed = useMemo(
    () => (data?.training.rows ?? [])
      .filter((row) => row.completion_status.toLowerCase() === "completed")
      .sort((left, right) => (right.completion_date ?? "").localeCompare(left.completion_date ?? "")),
    [data],
  )
  const overdue = useMemo(
    () => incomplete.filter((row) => row.due_date && row.due_date < today).length,
    [incomplete, today],
  )
  const mandatoryGaps = useMemo(() => incomplete.filter(isMandatory).length, [incomplete])
  const attentionAssignments = useMemo(
    () => incomplete.filter((row) => (
      Boolean(row.due_date && row.due_date < today)
      || isMandatory(row)
      || Boolean(row.due_date && row.due_date <= dueSoonDate)
    )),
    [dueSoonDate, incomplete, today],
  )
  const visibleAssignments = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const candidates = normalized ? incomplete : attentionAssignments
    return candidates.filter((row) => !normalized || [
      row.training_program,
      row.employee_id,
      names.get(row.employee_id) ?? "",
      row.department,
    ].some((value) => value.toLowerCase().includes(normalized)))
  }, [attentionAssignments, incomplete, names, query])
  const departmentCoverage = useMemo(() => {
    const grouped = new Map<string, { assigned: number; completed: number; overdue: number }>()
    for (const row of data?.training.rows ?? []) {
      const current = grouped.get(row.department) ?? { assigned: 0, completed: 0, overdue: 0 }
      current.assigned += 1
      if (row.completion_status.toLowerCase() === "completed") current.completed += 1
      if (row.completion_status.toLowerCase() !== "completed" && row.due_date && row.due_date < today) current.overdue += 1
      grouped.set(row.department, current)
    }
    return [...grouped.entries()]
      .map(([name, values]) => ({
        name,
        ...values,
        rate: values.assigned ? Math.round((values.completed / values.assigned) * 100) : 0,
      }))
      .sort((left, right) => left.rate - right.rate || right.assigned - left.assigned)
  }, [data, today])

  function refresh(message: string) {
    setNotice(message)
    setError("")
    setLoadedQuery(null)
    setRefreshKey((current) => current + 1)
  }

  async function submitAssignment(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError("")
    try {
      const response = await fetch("/api/v1/hr/workflows", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "training", ...assignment, hours: Number(assignment.hours) }),
      })
      const result = await response.json() as { error?: string; message?: string }
      if (!response.ok) throw new Error(result.error ?? "The training assignment could not be saved.")
      setAssignOpen(false)
      setAssignment({
        employeeId: assignablePeople[0]?.employee_id ?? "",
        program: "",
        dueDate: defaultDueDate(),
        hours: "2",
        note: "",
      })
      refresh(result.message ?? "Training assigned.")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The training assignment could not be saved.")
    } finally {
      setSaving(false)
    }
  }

  async function complete(row: TrainingRecord) {
    setBusyId(row.id)
    setError("")
    try {
      const response = await fetch("/api/v1/hr/workflows/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: row.id, type: "training", action: "complete" }),
      })
      const result = await response.json() as { error?: string; message?: string }
      if (!response.ok) throw new Error(result.error ?? "The assignment could not be completed.")
      refresh(result.message ?? "Training marked complete.")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The assignment could not be completed.")
    } finally {
      setBusyId(null)
    }
  }

  if (!data && loading) {
    return (
      <div className="space-y-4">
        <div className="h-32 animate-pulse rounded-lg bg-muted" />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.6fr)]">
          <div className="h-96 animate-pulse rounded-lg bg-muted" />
          <div className="h-96 animate-pulse rounded-lg bg-muted" />
        </div>
      </div>
    )
  }
  if (!data) {
    return <Card><CardContent className="p-6 text-body text-destructive">{error || "Learning data could not be loaded."}</CardContent></Card>
  }

  return (
    <div className="mx-auto flex w-full max-w-[1520px] flex-col gap-5 pb-10">
      <header className="border-b border-border pb-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-page font-semibold">Assign courses</h1>
            <p className="mt-1 max-w-2xl text-description text-muted-foreground">
              Assign training and resolve overdue or mandatory requirements.
            </p>
          </div>
          {actor.canAssignTraining && assignablePeople.length > 0 && (
            <Button onClick={() => { setError(""); setAssignOpen(true) }}>
              <Plus className="size-4" />
              Assign training
            </Button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-meta text-muted-foreground">
          <span>{data.training.rows.length} assignments in this view</span>
          <span>Updated {formatWorkspaceDateTime(data.generatedAt)}</span>
        </div>
      </header>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-3 sm:flex-row sm:items-end">
        <div className="w-full sm:max-w-xs">
          <Field label="Department">
            <select value={department} onChange={(event) => setDepartment(event.target.value)} className={inputClass}>
              <option value="">All departments</option>
              {data.dimensions.departments.map((item) => <option key={item}>{item}</option>)}
            </select>
          </Field>
        </div>
        {department && <Button size="sm" variant="ghost" onClick={() => setDepartment("")}>Clear</Button>}
        {loading && <span className="pb-2 text-meta text-muted-foreground">Updating…</span>}
      </div>

      {(notice || error) && (
        <div
          aria-live="polite"
          className={cn(
            "rounded-md border px-4 py-3 text-meta font-semibold",
            error
              ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-200"
              : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-200",
          )}
        >
          {error || notice}
        </div>
      )}

      <section className="grid overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-3 sm:divide-x sm:divide-border">
        {[
          { label: "Completion rate", value: `${data.training.completionRate.toLocaleString()}%`, detail: `${completed.length} of ${data.training.rows.length} assignments` },
          { label: "Overdue", value: overdue.toLocaleString(), detail: "Incomplete assignments past due" },
          { label: "Mandatory gaps", value: mandatoryGaps.toLocaleString(), detail: "Incomplete security or safety training" },
        ].map((metric, index) => (
          <div key={metric.label} className={cn("px-4 py-4", index > 0 && "border-t border-border sm:border-t-0")}>
            <p className="text-label text-muted-foreground">{metric.label}</p>
            <p className="mt-1 text-kpi font-semibold tabular-nums">{metric.value}</p>
            <p className="mt-1 text-meta text-muted-foreground">{metric.detail}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.55fr)]">
        <Card className="gap-0 overflow-hidden py-0 shadow-none">
          <CardHeader className="gap-4 border-b border-border px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle>Needs attention</CardTitle>
              <CardDescription>Overdue, mandatory, and assignments due in the next 14 days.</CardDescription>
            </div>
            <label className="relative">
              <span className="sr-only">Search assignments</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search all assignments"
                className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-control outline-none focus:ring-2 focus:ring-ring/30 sm:w-64"
              />
            </label>
          </CardHeader>
          <CardContent className="p-0">
            {visibleAssignments.length ? (
              <div>
                <div className="hidden grid-cols-[minmax(180px,1.3fr)_minmax(160px,1fr)_130px_118px] gap-4 bg-muted/40 px-5 py-2.5 text-label font-semibold text-muted-foreground md:grid">
                  <span>Course</span>
                  <span>Employee</span>
                  <span>Deadline</span>
                  <span className="text-right">Action</span>
                </div>
                <div className="divide-y divide-border/70">
                  {visibleAssignments.map((row) => {
                    const canComplete = Boolean(row.requested_by_email)
                      && (["admin", "hr"].includes(actor.role) || actor.employeeId === row.employee_id)
                    const isOverdue = Boolean(row.due_date && row.due_date < today)
                    const status = isOverdue ? "Overdue" : isMandatory(row) ? "Mandatory" : "Due soon"
                    return (
                      <div key={row.id} className="grid gap-3 px-4 py-3.5 md:grid-cols-[minmax(180px,1.3fr)_minmax(160px,1fr)_130px_118px] md:items-center md:gap-4 md:px-5">
                        <div className="min-w-0">
                          <p className="truncate text-card-title font-semibold">{row.training_program}</p>
                          <p className="mt-0.5 text-meta text-muted-foreground">{row.training_hours}h assigned</p>
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-body">{names.get(row.employee_id) ?? row.employee_id}</p>
                          <p className="mt-0.5 truncate text-meta text-muted-foreground">{row.department}</p>
                        </div>
                        <div>
                          <p className={cn(
                            "text-status font-semibold",
                            isOverdue ? "text-destructive" : "text-muted-foreground",
                          )}>
                            {status}
                          </p>
                          <p className="mt-0.5 text-meta text-muted-foreground">{dateLabel(row.due_date)}</p>
                        </div>
                        <div className="md:text-right">
                          {canComplete ? (
                            <Button size="xs" disabled={busyId !== null} onClick={() => void complete(row)}>
                              {busyId === row.id && <LoaderCircle className="size-3 animate-spin" />}
                              Mark complete
                            </Button>
                          ) : (
                            <span className="text-meta text-muted-foreground">Tracked</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="flex min-h-40 items-center justify-center px-6 text-center text-body text-muted-foreground">
                {query ? "No assignments match your search." : "No assignments require attention."}
              </div>
            )}
            <div className="border-t border-border bg-muted/20 px-5 py-2.5 text-meta text-muted-foreground">
              {query
                ? `Showing ${visibleAssignments.length} of ${incomplete.length} incomplete assignments.`
                : `Showing ${attentionAssignments.length} priority assignments of ${incomplete.length} incomplete. Search to find another assignment.`}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="gap-0 overflow-hidden py-0 shadow-none">
            <CardHeader className="border-b border-border px-5 py-4">
              <CardTitle>Department coverage</CardTitle>
              <CardDescription>Completion and overdue work in the current view.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid grid-cols-[minmax(0,1fr)_58px_58px_54px] gap-2 bg-muted/40 px-5 py-2.5 text-label font-semibold text-muted-foreground">
                <span>Department</span>
                <span className="text-right">Done</span>
                <span className="text-right">Overdue</span>
                <span className="text-right">Rate</span>
              </div>
              {departmentCoverage.length ? departmentCoverage.map((row) => (
                <button
                  key={row.name}
                  type="button"
                  onClick={() => setDepartment(row.name)}
                  className="grid w-full grid-cols-[minmax(0,1fr)_58px_58px_54px] gap-2 border-t border-border/70 px-5 py-3 text-left text-body hover:bg-muted/25"
                >
                  <span className="truncate font-semibold">{row.name}</span>
                  <span className="text-right tabular-nums">{row.completed}/{row.assigned}</span>
                  <span className={cn("text-right tabular-nums", row.overdue ? "text-destructive" : "text-muted-foreground")}>{row.overdue}</span>
                  <span className="text-right font-semibold tabular-nums">{row.rate}%</span>
                </button>
              )) : (
                <p className="px-5 py-8 text-center text-body text-muted-foreground">No training records are available.</p>
              )}
            </CardContent>
          </Card>

          <Card className="gap-0 overflow-hidden py-0 shadow-none">
            <CardHeader className="border-b border-border px-5 py-4">
              <CardTitle>Recent completions</CardTitle>
              <CardDescription>Latest completed assignments.</CardDescription>
            </CardHeader>
            <CardContent className="divide-y divide-border p-0">
              {completed.length ? completed.slice(0, 5).map((row) => (
                <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-card-title font-semibold">{row.training_program}</p>
                    <p className="mt-0.5 truncate text-meta text-muted-foreground">
                      {names.get(row.employee_id) ?? row.employee_id} · {row.department}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-meta font-semibold">{dateLabel(row.completion_date)}</p>
                    {row.assessment_score !== null && <p className="mt-0.5 text-status text-muted-foreground">{row.assessment_score}%</p>}
                  </div>
                </div>
              )) : (
                <div className="flex min-h-32 items-center justify-center px-5 text-body text-muted-foreground">No completions recorded.</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {assignOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close assignment form"
            className="absolute inset-0 bg-slate-950/40"
            onClick={() => !saving && setAssignOpen(false)}
          />
          <form onSubmit={submitAssignment} className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-none">
            <button type="button" aria-label="Close" onClick={() => setAssignOpen(false)} className="absolute right-5 top-5 text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
            <h2 className="text-section font-semibold">Assign training</h2>
            <p className="mt-1 text-description text-muted-foreground">Create a training assignment for an employee.</p>
            <div className="mt-6 space-y-4">
              <SelectEmployee value={assignment.employeeId} people={assignablePeople} onChange={(employeeId) => setAssignment({ ...assignment, employeeId })} />
              <Field label="Training programme">
                <input required className={inputClass} value={assignment.program} onChange={(event) => setAssignment({ ...assignment, program: event.target.value })} placeholder="Security and privacy essentials" />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Due date">
                  <input required type="date" className={inputClass} value={assignment.dueDate} onChange={(event) => setAssignment({ ...assignment, dueDate: event.target.value })} />
                </Field>
                <Field label="Estimated hours">
                  <input required min="0.5" max="500" step="0.5" type="number" className={inputClass} value={assignment.hours} onChange={(event) => setAssignment({ ...assignment, hours: event.target.value })} />
                </Field>
              </div>
              <Field label="Instructions (optional)">
                <textarea className={textareaClass} value={assignment.note} onChange={(event) => setAssignment({ ...assignment, note: event.target.value })} placeholder="Completion requirements or course link" />
              </Field>
            </div>
            {error && <p role="alert" className="mt-4 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-meta text-destructive">{error}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setAssignOpen(false)} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving || !assignment.employeeId}>
                {saving && <LoaderCircle className="size-4 animate-spin" />}
                Assign training
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
