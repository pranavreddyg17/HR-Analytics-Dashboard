"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { MetricStrip, WorkspaceHeader, WorkspacePage, WorkspaceSectionHeader } from "@/components/workspace-ui"
import type { AssetCondition, EmployeeExitDetail, EmployeeExitRecord, ExitDashboard, OffboardingTask } from "@/lib/exit-asset-types"
import type { ManagedEmployee } from "@/lib/people-types"
import { cn } from "@/lib/utils"

const fieldClass = "h-9 w-full rounded-md border border-border bg-background px-3 text-control outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"

function date(value: string | null): string {
  if (!value) return "Not recorded"
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function statusClass(status: string): string {
  if (status === "Completed") return "text-emerald-700 dark:text-emerald-300"
  if (status === "In Progress") return "text-primary"
  if (status === "Cancelled") return "text-muted-foreground"
  return "text-amber-700 dark:text-amber-300"
}

function Progress({ row }: { row: EmployeeExitRecord }) {
  return <div className="min-w-28"><div className="flex justify-between text-meta"><span>{row.progress}%</span><span>{row.completedTaskCount}/{row.taskCount}</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${row.progress}%` }} /></div></div>
}

function TaskRow({ task, exitId, canManage, busy, onUpdate }: { task: OffboardingTask; exitId: string; canManage: boolean; busy: boolean; onUpdate: (detail: EmployeeExitDetail | undefined, message: string) => void }) {
  const [condition, setCondition] = useState<AssetCondition>("Good")
  async function update(status: OffboardingTask["status"]) {
    const response = await fetch(`/api/v1/hr/exits/${encodeURIComponent(exitId)}/tasks/${encodeURIComponent(task.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status, ...(task.assetAssignmentId && status === "Completed" ? { returnCondition: condition } : {}) }) })
    const body = await response.json() as EmployeeExitDetail & { error?: string }
    if (!response.ok) throw new Error(body.error || "Task could not be updated.")
    onUpdate(body, status === "Completed" ? "Task completed." : "Task status updated.")
  }
  return <div className="grid gap-3 border-t border-border px-4 py-3 first:border-t-0 lg:grid-cols-[minmax(0,1fr)_110px_120px_minmax(170px,auto)] lg:items-center">
    <div><p className="text-body font-semibold">{task.title}</p><p className="text-meta text-muted-foreground">{task.ownerTeam} · due {date(task.dueDate)}{task.assetTag ? ` · ${task.assetTag}` : ""}</p></div>
    <span className={cn("text-meta font-semibold", statusClass(task.status))}>{task.status}</span>
    <span className="text-meta text-muted-foreground">{task.completedAt ? date(task.completedAt) : "Not completed"}</span>
    {canManage && task.status !== "Completed" ? <div className="flex justify-end gap-2">{task.assetAssignmentId && <select aria-label="Return condition" value={condition} onChange={(event) => setCondition(event.target.value as AssetCondition)} className={cn(fieldClass, "w-28")}><option>Good</option><option>Degraded</option><option>Broken</option></select>}{task.status === "Pending" && <Button size="xs" variant="outline" disabled={busy} onClick={() => void update("In Progress").catch((error: unknown) => onUpdate(undefined, error instanceof Error ? error.message : "Task could not be updated."))}>Start</Button>}<Button size="xs" disabled={busy} onClick={() => void update("Completed").catch((error: unknown) => onUpdate(undefined, error instanceof Error ? error.message : "Task could not be updated."))}>Complete</Button></div> : <span />}
  </div>
}

export function ExitManagementWorkspace({ initialData, initialDetail, canManage }: { initialData: ExitDashboard; initialDetail: EmployeeExitDetail | null; canManage: boolean }) {
  const [data, setData] = useState(initialData)
  const [detail, setDetail] = useState(initialDetail)
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("")
  const [horizon, setHorizon] = useState(0)
  const [showCreate, setShowCreate] = useState(false)
  const [employeeSearch, setEmployeeSearch] = useState("")
  const [employees, setEmployees] = useState<ManagedEmployee[]>([])
  const [employeeId, setEmployeeId] = useState("")
  const [busy, setBusy] = useState(false)
  const [renderedAt] = useState(() => Date.now())
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    if (!employeeSearch.trim() || employeeId) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => fetch(`/api/v1/hr/people?search=${encodeURIComponent(employeeSearch.trim())}&limit=20`, { signal: controller.signal, cache: "no-store" })
      .then((response) => response.json()).then((body: { items?: ManagedEmployee[] }) => setEmployees((body.items ?? []).filter((item) => !["Terminated", "Resigned"].includes(item.employment_status)))).catch(() => undefined), 220)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [employeeId, employeeSearch])

  const visible = useMemo(() => data.items.filter((row) => {
    const needle = search.trim().toLowerCase()
    const inHorizon = !horizon || (["Scheduled", "In Progress"].includes(row.status) && new Date(`${row.expectedExitDate}T00:00:00`).getTime() <= renderedAt + horizon * 86_400_000)
    return (!needle || [row.employeeName, row.employeeId, row.department, row.jobTitle, row.manager].some((value) => value.toLowerCase().includes(needle))) && (!status || row.status === status) && inHorizon
  }), [data.items, horizon, renderedAt, search, status])

  async function refresh(selectedId = detail?.id) {
    const [listResponse, detailResponse] = await Promise.all([
      fetch("/api/v1/hr/exits?limit=250", { cache: "no-store" }),
      selectedId ? fetch(`/api/v1/hr/exits/${encodeURIComponent(selectedId)}`, { cache: "no-store" }) : Promise.resolve(null),
    ])
    const list = await listResponse.json() as ExitDashboard & { error?: string }
    if (!listResponse.ok) throw new Error(list.error || "Exit dashboard could not be refreshed.")
    setData(list)
    if (detailResponse) {
      const selected = await detailResponse.json() as EmployeeExitDetail & { error?: string }
      if (!detailResponse.ok) throw new Error(selected.error || "Exit details could not be refreshed.")
      setDetail(selected)
    }
  }

  async function open(row: EmployeeExitRecord) {
    setBusy(true); setError("")
    try {
      const response = await fetch(`/api/v1/hr/exits/${encodeURIComponent(row.id)}`, { cache: "no-store" })
      const body = await response.json() as EmployeeExitDetail & { error?: string }
      if (!response.ok) throw new Error(body.error || "Exit details could not be loaded.")
      setDetail(body)
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Exit details could not be loaded.") }
    finally { setBusy(false) }
  }

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true); setError(""); setMessage("")
    try {
      const response = await fetch("/api/v1/hr/exits", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ employeeId, exitType: form.get("exitType"), expectedExitDate: form.get("expectedExitDate"), notes: form.get("notes") }) })
      const body = await response.json() as EmployeeExitDetail & { error?: string }
      if (!response.ok) throw new Error(body.error || "Exit workflow could not be created.")
      setDetail(body); setShowCreate(false); setEmployeeSearch(""); setEmployeeId(""); setEmployees([]); setMessage("Exit workflow created from the employee record and assigned assets."); await refresh(body.id)
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Exit workflow could not be created.") }
    finally { setBusy(false) }
  }

  async function completeExit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!detail) return
    const actualExitDate = String(new FormData(event.currentTarget).get("actualExitDate") ?? "")
    setBusy(true); setError("")
    try {
      const response = await fetch(`/api/v1/hr/exits/${encodeURIComponent(detail.id)}/complete`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ actualExitDate }) })
      const body = await response.json() as EmployeeExitDetail & { error?: string }
      if (!response.ok) throw new Error(body.error || "Exit could not be completed.")
      setDetail(body); setMessage("Exit completed and recorded in attrition history."); await refresh(body.id)
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Exit could not be completed.") }
    finally { setBusy(false) }
  }

  async function cancelExit() {
    if (!detail) return
    setBusy(true); setError("")
    try {
      const response = await fetch(`/api/v1/hr/exits/${encodeURIComponent(detail.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "cancel" }) })
      const body = await response.json() as EmployeeExitDetail & { error?: string }
      if (!response.ok) throw new Error(body.error || "Exit could not be cancelled.")
      setDetail(body); setMessage("Exit workflow cancelled and employee status restored."); await refresh(body.id)
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Exit could not be cancelled.") }
    finally { setBusy(false) }
  }

  function taskUpdated(next: EmployeeExitDetail | undefined, notice: string) {
    if (!next) { setError(notice); return }
    setDetail(next); setMessage(notice); setError(""); void refresh(next.id)
  }

  return <WorkspacePage>
    <WorkspaceHeader title="Exit management" description="Scheduled exits, offboarding tasks, asset recovery, and access removal." meta={`${data.total.toLocaleString()} exit record${data.total === 1 ? "" : "s"}`} actions={canManage ? <Button onClick={() => setShowCreate((current) => !current)}>{showCreate ? "Close" : "Schedule exit"}</Button> : undefined} />
    <MetricStrip metrics={[
      { label: "Next 30 days", value: data.summary.leaving30Days, detail: `${data.summary.leaving60Days} in 60 days · ${data.summary.leaving90Days} in 90 days` },
      { label: "Incomplete offboarding", value: data.summary.incompleteOffboarding, detail: "Open scheduled exits" },
      { label: "Assets to recover", value: data.summary.outstandingAssets, detail: "Active assignments linked to exits" },
      { label: "Access removal", value: data.summary.pendingAccessRemoval, detail: "Pending IT tasks" },
    ]} />
    {showCreate && <form onSubmit={create} className="surface-card overflow-hidden"><WorkspaceSectionHeader title="Schedule employee exit" description="Creates the checklist, work-queue item, and asset-return tasks." /><div className="grid gap-3 p-4 lg:grid-cols-4">
      <div className="relative lg:col-span-2"><label className="text-label font-semibold">Employee<input required type="search" value={employeeSearch} onChange={(event) => { setEmployeeSearch(event.target.value); setEmployeeId(""); setEmployees([]) }} className={fieldClass} placeholder="Search name, role, email, or employee ID" /></label>{employees.length > 0 && <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-card shadow-lg">{employees.map((employee) => <button key={employee.employee_id} type="button" onClick={() => { setEmployeeId(employee.employee_id); setEmployeeSearch(`${employee.display_name} · ${employee.employee_id}`); setEmployees([]) }} className="block w-full border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-muted"><span className="block text-body font-semibold">{employee.display_name}</span><span className="text-meta text-muted-foreground">{employee.job_title} · {employee.department}</span></button>)}</div>}</div>
      <label className="text-label font-semibold">Exit type<select name="exitType" className={fieldClass}><option>Resignation</option><option>Termination</option><option>Contract end</option><option>Other</option></select></label>
      <label className="text-label font-semibold">Expected last working date<input required name="expectedExitDate" type="date" className={fieldClass} /></label>
      <label className="text-label font-semibold lg:col-span-4">Notes<textarea name="notes" className="mt-1 min-h-20 w-full rounded-md border border-border bg-background px-3 py-2 text-body" /></label>
    </div><div className="flex justify-end border-t border-border px-4 py-3"><Button type="submit" disabled={busy || !employeeId}>{busy ? "Creating" : "Create exit workflow"}</Button></div></form>}
    {message && <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-meta text-emerald-800">{message}</p>}
    {error && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-meta text-rose-800">{error}</p>}
    <section className="surface-card overflow-hidden"><WorkspaceSectionHeader title="Offboarding register" description="Known exits only; attrition-model predictions remain separate." /><div className="grid gap-3 border-b border-border p-3 sm:grid-cols-3"><input type="search" className={fieldClass} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search employee, role, or department" /><select className={fieldClass} value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option><option>Scheduled</option><option>In Progress</option><option>Completed</option><option>Cancelled</option></select><select className={fieldClass} value={horizon} onChange={(event) => setHorizon(Number(event.target.value))}><option value="0">Any exit date</option><option value="30">Next 30 days</option><option value="60">Next 60 days</option><option value="90">Next 90 days</option></select></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-body"><thead className="bg-muted/35 text-label font-semibold text-muted-foreground"><tr><th className="px-4 py-2.5">Employee</th><th className="px-4 py-2.5">Exit</th><th className="px-4 py-2.5">Progress</th><th className="px-4 py-2.5">Outstanding</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5"><span className="sr-only">Open</span></th></tr></thead><tbody>{visible.map((row) => <tr key={row.id} className={cn("border-t border-border/70 hover:bg-muted/20", detail?.id === row.id && "bg-accent/35")}><td className="px-4 py-3"><p className="font-semibold">{row.employeeName}</p><p className="text-meta text-muted-foreground">{row.jobTitle} · {row.department}</p></td><td className="px-4 py-3"><p>{row.exitType}</p><p className="text-meta text-muted-foreground">Last day {date(row.expectedExitDate)}</p></td><td className="px-4 py-3"><Progress row={row} /></td><td className="px-4 py-3"><p>{row.outstandingHrTasks} HR · {row.outstandingItTasks} IT</p><p className="text-meta text-muted-foreground">{row.outstandingAssets} asset{row.outstandingAssets === 1 ? "" : "s"}</p></td><td className={cn("px-4 py-3 font-semibold", statusClass(row.status))}>{row.status}</td><td className="px-4 py-3 text-right"><Button size="xs" variant="outline" onClick={() => void open(row)}>Review</Button></td></tr>)}</tbody></table></div>{!visible.length && <p className="p-10 text-center text-body text-muted-foreground">No exit records match these filters.</p>}</section>
    {detail && <section className="surface-card overflow-hidden"><WorkspaceSectionHeader title={`${detail.employeeName} offboarding`} description={`${detail.exitType} · expected ${date(detail.expectedExitDate)} · ${detail.progress}% complete`} action={<Button size="xs" variant="ghost" onClick={() => setDetail(null)}>Close</Button>} />
      <div className="grid gap-px border-b border-border bg-border sm:grid-cols-4"><div className="bg-card p-4"><p className="text-label text-muted-foreground">Manager</p><p className="mt-1 text-body font-semibold">{detail.manager}</p></div><div className="bg-card p-4"><p className="text-label text-muted-foreground">HR tasks</p><p className="mt-1 text-body font-semibold">{detail.outstandingHrTasks} outstanding</p></div><div className="bg-card p-4"><p className="text-label text-muted-foreground">IT tasks</p><p className="mt-1 text-body font-semibold">{detail.outstandingItTasks} outstanding</p></div><div className="bg-card p-4"><p className="text-label text-muted-foreground">Assets</p><p className="mt-1 text-body font-semibold">{detail.outstandingAssets} to recover</p></div></div>
      <div>{detail.tasks.map((task) => <TaskRow key={task.id} task={task} exitId={detail.id} canManage={canManage && ["Scheduled", "In Progress"].includes(detail.status)} busy={busy} onUpdate={taskUpdated} />)}</div>
      {canManage && ["Scheduled", "In Progress"].includes(detail.status) && <div className="flex flex-col gap-3 border-t border-border bg-muted/20 p-4 sm:flex-row sm:items-end sm:justify-between"><Button variant="ghost" onClick={() => void cancelExit()} disabled={busy}>Cancel exit</Button><form onSubmit={completeExit} className="flex items-end gap-2"><label className="text-label font-semibold">Actual last working date<input required name="actualExitDate" type="date" defaultValue={detail.expectedExitDate} className={fieldClass} /></label><Button type="submit" disabled={busy || detail.completedTaskCount !== detail.taskCount}>Complete exit</Button></form></div>}
      <div className="border-t border-border px-4 py-3 text-meta text-muted-foreground">Completing this workflow records the actual exit in attrition history. Model-predicted risk is not changed.</div>
    </section>}
  </WorkspacePage>
}
