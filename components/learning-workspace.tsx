"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { LoaderCircle, Plus, Search, X } from "lucide-react"

import { SelectEmployee } from "@/components/workflow-creator"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { MetricStrip, WorkspaceHeader, WorkspacePage } from "@/components/workspace-ui"
import type { LearningAssignment, LearningOperations } from "@/lib/learning-types"
import type { WorkflowActorContext } from "@/lib/people-types"
import { cn } from "@/lib/utils"

const inputClass = "h-9 w-full rounded-md border border-border bg-background px-3 text-control outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
const textareaClass = "min-h-20 w-full resize-y rounded-md border border-border bg-background px-3 py-2.5 text-control outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"

function dateAfterToday(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function dateLabel(value?: string | null): string {
  if (!value) return "No due date"
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`)
  return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(parsed) : value
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-label font-semibold">{label}</span>{children}</label>
}

function Modal({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
    <button type="button" aria-label="Close dialog" className="absolute inset-0 bg-slate-950/45" onClick={onClose}/>
    <section role="dialog" aria-modal="true" aria-label={title} className="relative max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-lg border border-border bg-background shadow-xl">
      <header className="border-b border-border px-5 py-4 pr-14"><h2 className="text-section font-semibold">{title}</h2><p className="mt-0.5 text-description text-muted-foreground">{description}</p></header>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute right-5 top-5 text-muted-foreground hover:text-foreground"><X className="size-4"/></button>
      {children}
    </section>
  </div>
}

export function LearningWorkspace({ actor }: { actor: WorkflowActorContext }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const selectedAssignmentId = searchParams.get("assignment")
  const [department, setDepartment] = useState(searchParams.get("department") ?? "")
  const [location, setLocation] = useState(searchParams.get("location") ?? "")
  const [query, setQuery] = useState(searchParams.get("q") ?? "")
  const [status, setStatus] = useState(selectedAssignmentId ? "all" : "attention")
  const [data, setData] = useState<LearningOperations | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")
  const [dialog, setDialog] = useState<"assign" | "course" | "complete" | null>(searchParams.get("new") === "course" ? "assign" : null)
  const [selected, setSelected] = useState<LearningAssignment | null>(null)
  const [assignment, setAssignment] = useState({ targetType: "employee", targetValue: "", employeeId: "", courseId: "", dueDate: dateAfterToday(14), hours: "", note: "" })
  const [course, setCourse] = useState({ code: "", title: "", defaultHours: "2", isMandatory: false })
  const [completion, setCompletion] = useState({ score: "", note: "" })

  const requestQuery = useMemo(() => {
    const params = new URLSearchParams()
    if (department) params.set("department", department)
    if (location) params.set("location", location)
    return params.toString()
  }, [department, location])

  async function load(message = "") {
    setLoading(true)
    setError("")
    try {
      const response = await fetch(`/api/v1/hr/learning${requestQuery ? `?${requestQuery}` : ""}`, { cache: "no-store" })
      const result = await response.json() as LearningOperations & { error?: string }
      if (!response.ok) throw new Error(result.error || "Learning operations could not be loaded.")
      setData(result)
      setNotice(message)
      if (message) window.setTimeout(() => setNotice(""), 3500)
      setAssignment((current) => ({
        ...current,
        employeeId: result.people.some((person) => person.employeeId === current.employeeId) ? current.employeeId : result.people[0]?.employeeId ?? "",
        targetValue: current.targetType === "employee" ? (result.people.some((person) => person.employeeId === current.employeeId) ? current.employeeId : result.people[0]?.employeeId ?? "") : current.targetValue,
        courseId: result.courses.some((item) => item.id === current.courseId) ? current.courseId : result.courses[0]?.id ?? "",
      }))
      router.refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Learning operations could not be loaded.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/v1/hr/learning${requestQuery ? `?${requestQuery}` : ""}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json() as LearningOperations & { error?: string }
        if (!response.ok) throw new Error(result.error || "Learning operations could not be loaded.")
        return result
      })
      .then((result) => {
        setData(result)
        setAssignment((current) => ({ ...current, employeeId: result.people.some((person) => person.employeeId === current.employeeId) ? current.employeeId : result.people[0]?.employeeId ?? "", targetValue: current.targetType === "employee" ? (result.people.some((person) => person.employeeId === current.employeeId) ? current.employeeId : result.people[0]?.employeeId ?? "") : current.targetValue, courseId: result.courses.some((item) => item.id === current.courseId) ? current.courseId : result.courses[0]?.id ?? "" }))
        setError("")
      })
      .catch((reason: unknown) => { if ((reason as { name?: string })?.name !== "AbortError") setError(reason instanceof Error ? reason.message : "Learning operations could not be loaded.") })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [requestQuery])

  const today = new Date().toISOString().slice(0, 10)
  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return (data?.assignments ?? []).filter((row) => {
      if (row.id === selectedAssignmentId) return true
      const completed = row.status.toLowerCase() === "completed"
      const overdue = !completed && Boolean(row.dueDate && row.dueDate < today)
      const matchesStatus = status === "all" || status === "completed" && completed || status === "overdue" && overdue || status === "incomplete" && !completed || status === "attention" && !completed && (overdue || row.isMandatory || Boolean(row.dueDate && row.dueDate <= dateAfterToday(14)))
      return matchesStatus && (!normalized || [row.courseTitle, row.employeeName, row.employeeId, row.department].some((value) => value.toLowerCase().includes(normalized)))
    })
  }, [data?.assignments, query, selectedAssignmentId, status, today])

  useEffect(() => {
    if (!selectedAssignmentId || !data?.assignments.some((row) => row.id === selectedAssignmentId)) return
    const frame = window.requestAnimationFrame(() => document.getElementById(`assignment-${selectedAssignmentId}`)?.scrollIntoView({ block: "center" }))
    return () => window.cancelAnimationFrame(frame)
  }, [data?.assignments, selectedAssignmentId])

  const employeeOptions = useMemo(() => (data?.people ?? []).map((person) => ({ employee_id: person.employeeId, display_name: person.displayName, department: person.department, job_title: person.jobTitle, location: person.location })), [data?.people])
  const selectedCourse = data?.courses.find((item) => item.id === assignment.courseId)
  const targetCount = useMemo(() => (data?.people ?? []).filter((person) => {
    if (assignment.targetType === "employee") return person.employeeId === assignment.employeeId
    if (assignment.targetType === "department") return person.department === assignment.targetValue
    if (assignment.targetType === "job_title") return person.jobTitle === assignment.targetValue
    if (assignment.targetType === "job_level") return person.jobLevel === assignment.targetValue
    return actor.role === "manager"
  }).length, [actor.role, assignment.employeeId, assignment.targetType, assignment.targetValue, data?.people])

  function openAssign() {
    setError("")
    setAssignment((current) => ({ ...current, employeeId: current.employeeId || data?.people[0]?.employeeId || "", targetValue: current.targetType === "employee" ? (current.employeeId || data?.people[0]?.employeeId || "") : current.targetValue, courseId: current.courseId || data?.courses[0]?.id || "" }))
    setDialog("assign")
  }

  async function submitAssignment(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError("")
    try {
      const response = await fetch("/api/v1/hr/learning", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ employeeId: assignment.targetType === "employee" ? assignment.employeeId : undefined, targetType: assignment.targetType, targetValue: assignment.targetType === "manager_team" ? undefined : assignment.targetType === "employee" ? assignment.employeeId : assignment.targetValue, courseId: assignment.courseId, dueDate: assignment.dueDate, hours: assignment.hours ? Number(assignment.hours) : undefined, note: assignment.note }) })
      const result = await response.json() as { error?: string; message?: string }
      if (!response.ok) throw new Error(result.error || "The course could not be assigned.")
      setDialog(null)
      setAssignment((current) => ({ ...current, dueDate: dateAfterToday(14), hours: "", note: "" }))
      await load(result.message || "Course assigned.")
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The course could not be assigned.") } finally { setSaving(false) }
  }

  async function submitCourse(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError("")
    try {
      const response = await fetch("/api/v1/hr/learning/courses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: course.code || undefined, title: course.title, defaultHours: Number(course.defaultHours), isMandatory: course.isMandatory }) })
      const result = await response.json() as { error?: string; message?: string }
      if (!response.ok) throw new Error(result.error || "The course could not be created.")
      setDialog(null)
      setCourse({ code: "", title: "", defaultHours: "2", isMandatory: false })
      await load(result.message || "Course created.")
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The course could not be created.") } finally { setSaving(false) }
  }

  async function submitCompletion(event: React.FormEvent) {
    event.preventDefault()
    if (!selected) return
    setSaving(true)
    setError("")
    try {
      const response = await fetch(`/api/v1/hr/learning/assignments/${encodeURIComponent(selected.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ assessmentScore: completion.score ? Number(completion.score) : null, note: completion.note }) })
      const result = await response.json() as { error?: string; message?: string }
      if (!response.ok) throw new Error(result.error || "Completion could not be recorded.")
      setDialog(null)
      setSelected(null)
      setCompletion({ score: "", note: "" })
      await load(result.message || "Completion recorded.")
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Completion could not be recorded.") } finally { setSaving(false) }
  }

  if (!data && loading) return <div className="space-y-4"><div className="h-32 animate-pulse rounded-lg bg-muted"/><div className="h-96 animate-pulse rounded-lg bg-muted"/></div>
  if (!data) return <Card><CardContent className="p-6 text-body text-destructive">{error || "Learning operations could not be loaded."}</CardContent></Card>

  return <WorkspacePage>
    <WorkspaceHeader title="Assign courses" description="Course assignments and completion." meta={<>{data.summary.assignments} assignments</>} actions={actor.canAssignTraining ? <>{["admin", "hr"].includes(actor.role) && <Button variant="outline" onClick={() => { setError(""); setDialog("course") }}>New course</Button>}<Button onClick={openAssign}><Plus className="size-3.5"/>Assign course</Button></> : undefined}/>
    {(notice || error) && <div aria-live="polite" className={cn("rounded-md border px-4 py-3 text-meta", error ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800")}>{error || notice}</div>}
    <MetricStrip metrics={[
      { label: "Completion", value: `${data.summary.completionRate}%`, detail: `${data.summary.completed} of ${data.summary.assignments}` },
      { label: "Overdue", value: data.summary.overdue, detail: "Past due and incomplete" },
      { label: "Mandatory gaps", value: data.summary.mandatoryGaps, detail: "Required courses incomplete" },
    ]}/>
    <Card className="gap-0 overflow-hidden py-0 shadow-none">
      <CardHeader className="gap-3 border-b border-border px-5 py-4">
        <div><CardTitle>Assignment register</CardTitle><CardDescription>Deadlines and recorded completion evidence.</CardDescription></div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(230px,1fr)_170px_200px_180px]">
          <label className="relative"><span className="sr-only">Search assignments</span><Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search course or employee" className={`${inputClass} pl-9`}/></label>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className={inputClass}><option value="attention">Needs attention</option><option value="overdue">Overdue</option><option value="incomplete">Incomplete</option><option value="completed">Completed</option><option value="all">All assignments</option></select>
          <select value={department} onChange={(event) => setDepartment(event.target.value)} className={inputClass}><option value="">All departments</option>{data.dimensions.departments.map((item) => <option key={item}>{item}</option>)}</select>
          <select value={location} onChange={(event) => setLocation(event.target.value)} className={inputClass}><option value="">All locations</option>{data.dimensions.locations.map((item) => <option key={item}>{item}</option>)}</select>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto"><table className="w-full min-w-[940px] text-left text-body">
          <thead className="bg-muted/40 text-label font-semibold text-muted-foreground"><tr>{["Course", "Employee", "Status", "Due", "Hours", "Evidence", ""].map((heading) => <th key={heading} className="px-4 py-2.5">{heading}</th>)}</tr></thead>
          <tbody>{visible.map((row) => {
            const completed = row.status.toLowerCase() === "completed"
            const overdue = !completed && Boolean(row.dueDate && row.dueDate < today)
            return <tr id={`assignment-${row.id}`} key={row.id} aria-current={row.id === selectedAssignmentId ? "true" : undefined} className={cn("scroll-mt-24 border-t border-border/70 hover:bg-muted/20", row.id === selectedAssignmentId && "bg-accent/45 ring-1 ring-inset ring-primary/30")}>
              <td className="px-4 py-3"><p className="font-semibold">{row.courseTitle}</p>{row.isMandatory && <p className="text-meta text-muted-foreground">Mandatory</p>}</td>
              <td className="px-4 py-3"><p>{row.employeeName}</p><p className="text-meta text-muted-foreground">{row.department} · {row.employeeId}</p></td>
              <td className={cn("px-4 py-3 font-semibold", overdue ? "text-destructive" : completed ? "text-emerald-700" : "text-muted-foreground")}>{overdue ? "Overdue" : completed ? "Completed" : "Assigned"}</td>
              <td className="px-4 py-3 text-muted-foreground">{completed ? dateLabel(row.completedAt) : dateLabel(row.dueDate)}</td>
              <td className="px-4 py-3 tabular-nums">{row.assignedHours}h</td>
              <td className="px-4 py-3 text-muted-foreground">{row.assessmentScore === null ? row.completionNote || "—" : `${row.assessmentScore}%`}</td>
              <td className="px-4 py-3 text-right">{!completed && row.canComplete ? <Button size="xs" variant="outline" onClick={() => { setSelected(row); setCompletion({ score: "", note: "" }); setError(""); setDialog("complete") }}>Record completion</Button> : <span className="text-meta text-muted-foreground">—</span>}</td>
            </tr>
          })}</tbody>
        </table></div>
        {!visible.length && <p className="p-10 text-center text-body text-muted-foreground">No assignments match this view.</p>}
        <div className="border-t border-border bg-muted/20 px-4 py-2.5 text-meta text-muted-foreground">Showing {visible.length} of {data.assignments.length} assignments</div>
      </CardContent>
    </Card>
    {dialog === "assign" && <Modal title="Assign course" description="Create tracked assignments for one employee or a defined workforce group." onClose={() => !saving && setDialog(null)}><form onSubmit={submitAssignment} className="space-y-4 p-5">
      <Field label="Assign to"><select value={assignment.targetType} onChange={(event) => { const targetType = event.target.value; const targetValue = targetType === "employee" ? (assignment.employeeId || data.people[0]?.employeeId || "") : targetType === "department" ? data.dimensions.departments[0] ?? "" : targetType === "job_title" ? data.dimensions.jobTitles[0] ?? "" : targetType === "job_level" ? data.dimensions.jobLevels[0] ?? "" : ""; setAssignment({ ...assignment, targetType, targetValue }) }} className={inputClass}><option value="employee">One employee</option>{actor.role === "manager" ? <option value="manager_team">My direct reports</option> : <><option value="department">Department</option><option value="job_title">Job title</option><option value="job_level">Job level</option></>}</select></Field>
      {assignment.targetType === "employee" && (
        <SelectEmployee value={assignment.employeeId} people={employeeOptions} onChange={(employeeId) => setAssignment({ ...assignment, employeeId, targetValue: employeeId })}/>
      )}
      {assignment.targetType === "department" && <Field label="Department"><select value={assignment.targetValue} onChange={(event) => setAssignment({ ...assignment, targetValue: event.target.value })} className={inputClass}>{data.dimensions.departments.map((item) => <option key={item}>{item}</option>)}</select></Field>}
      {assignment.targetType === "job_title" && <Field label="Job title"><select value={assignment.targetValue} onChange={(event) => setAssignment({ ...assignment, targetValue: event.target.value })} className={inputClass}>{data.dimensions.jobTitles.map((item) => <option key={item}>{item}</option>)}</select></Field>}
      {assignment.targetType === "job_level" && <Field label="Job level"><select value={assignment.targetValue} onChange={(event) => setAssignment({ ...assignment, targetValue: event.target.value })} className={inputClass}>{data.dimensions.jobLevels.map((item) => <option key={item}>{item}</option>)}</select></Field>}
      <p className="rounded-md bg-muted/45 px-3 py-2 text-meta text-muted-foreground">{targetCount} eligible employee{targetCount === 1 ? "" : "s"}. Existing incomplete assignments for this course will be skipped.</p>
      <Field label="Course"><select required value={assignment.courseId} onChange={(event) => { const item = data.courses.find((courseItem) => courseItem.id === event.target.value); setAssignment({ ...assignment, courseId: event.target.value, hours: item ? String(item.defaultHours) : "" }) }} className={inputClass}>{data.courses.map((item) => <option key={item.id} value={item.id}>{item.title}{item.isMandatory ? " · Mandatory" : ""}</option>)}</select></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Due date"><input required type="date" min={today} value={assignment.dueDate} onChange={(event) => setAssignment({ ...assignment, dueDate: event.target.value })} className={inputClass}/></Field><Field label="Assigned hours"><input type="number" min="0.5" max="500" step="0.5" value={assignment.hours || selectedCourse?.defaultHours || ""} onChange={(event) => setAssignment({ ...assignment, hours: event.target.value })} className={inputClass}/></Field></div><Field label="Instructions"><textarea value={assignment.note} onChange={(event) => setAssignment({ ...assignment, note: event.target.value })} className={textareaClass} placeholder="Optional completion requirements or course link"/></Field>{error && <p className="text-meta text-destructive">{error}</p>}<div className="flex justify-end gap-2 border-t border-border pt-4"><Button type="button" variant="ghost" onClick={() => setDialog(null)} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving || !targetCount || !assignment.courseId}>{saving && <LoaderCircle className="size-4 animate-spin"/>}Assign to {targetCount}</Button></div></form></Modal>}
    {dialog === "course" && <Modal title="New course" description="Add a reusable course to the workspace catalog." onClose={() => !saving && setDialog(null)}><form onSubmit={submitCourse} className="space-y-4 p-5"><Field label="Course title"><input required value={course.title} onChange={(event) => setCourse({ ...course, title: event.target.value })} className={inputClass}/></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Course code"><input value={course.code} onChange={(event) => setCourse({ ...course, code: event.target.value })} className={inputClass} placeholder="Optional"/></Field><Field label="Default hours"><input required type="number" min="0.5" max="500" step="0.5" value={course.defaultHours} onChange={(event) => setCourse({ ...course, defaultHours: event.target.value })} className={inputClass}/></Field></div><label className="flex items-center gap-2 text-body"><input type="checkbox" checked={course.isMandatory} onChange={(event) => setCourse({ ...course, isMandatory: event.target.checked })}/>Required for assigned employees</label>{error && <p className="text-meta text-destructive">{error}</p>}<div className="flex justify-end gap-2 border-t border-border pt-4"><Button type="button" variant="ghost" onClick={() => setDialog(null)} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving}>{saving && <LoaderCircle className="size-4 animate-spin"/>}Create course</Button></div></form></Modal>}
    {dialog === "complete" && selected && <Modal title="Record completion" description={`${selected.courseTitle} · ${selected.employeeName}`} onClose={() => !saving && setDialog(null)}><form onSubmit={submitCompletion} className="space-y-4 p-5"><Field label="Assessment score"><input type="number" min="0" max="100" step="1" value={completion.score} onChange={(event) => setCompletion({ ...completion, score: event.target.value })} className={inputClass} placeholder="Optional"/></Field><Field label="Completion evidence or note"><textarea value={completion.note} onChange={(event) => setCompletion({ ...completion, note: event.target.value })} className={textareaClass} placeholder="Optional certificate, LMS reference, or reviewer note"/></Field>{error && <p className="text-meta text-destructive">{error}</p>}<div className="flex justify-end gap-2 border-t border-border pt-4"><Button type="button" variant="ghost" onClick={() => setDialog(null)} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving}>{saving && <LoaderCircle className="size-4 animate-spin"/>}Save completion</Button></div></form></Modal>}
  </WorkspacePage>
}
