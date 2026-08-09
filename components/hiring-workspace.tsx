"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { LoaderCircle, Plus, Search, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatWorkspaceDateTime } from "@/lib/date-format"
import type { HiringActivity, HiringCandidate, HiringCandidateStage, HiringOperations, HiringRequisition } from "@/lib/hiring-types"
import { cn } from "@/lib/utils"
import { MetricStrip, WorkspaceHeader, WorkspacePage } from "@/components/workspace-ui"
import { safeReturnTo } from "@/lib/navigation"

const activeStatuses = new Set(["Requested", "Open", "Offer"])
const activeCandidateStages = new Set<HiringCandidateStage>(["Applied", "Screening", "Interview", "Offer"])
const candidateSources = ["Careers site", "Employee referral", "LinkedIn", "Agency", "University", "Other"]
const fieldClass = "h-9 w-full rounded-md border border-border bg-background px-3 text-control outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
const textareaClass = "min-h-24 w-full resize-y rounded-md border border-border bg-background px-3 py-2.5 text-control outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"

function formatDate(value: string | null): string {
  if (!value) return "Not scheduled"
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`)
  return Number.isFinite(parsed.getTime())
    ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(parsed)
    : value
}

function dateAfterToday(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function candidateDefaults(stage: HiringCandidateStage): { nextStep: string; dueDate: string } {
  if (stage === "Applied") return { nextStep: "Review application", dueDate: dateAfterToday(2) }
  if (stage === "Screening") return { nextStep: "Complete recruiter screen", dueDate: dateAfterToday(3) }
  if (stage === "Interview") return { nextStep: "Schedule or record interview outcome", dueDate: dateAfterToday(4) }
  if (stage === "Offer") return { nextStep: "Record offer response", dueDate: dateAfterToday(5) }
  if (stage === "Hired") return { nextStep: "No further action", dueDate: "" }
  return { nextStep: "No further action", dueDate: "" }
}

function candidateStageOptions(stage: HiringCandidateStage): HiringCandidateStage[] {
  if (stage === "Applied") return ["Applied", "Screening", "Rejected"]
  if (stage === "Screening") return ["Screening", "Interview", "Rejected"]
  if (stage === "Interview") return ["Interview", "Offer", "Rejected"]
  if (stage === "Offer") return ["Offer", "Hired", "Rejected"]
  return [stage]
}

function statusTone(status: string): string {
  const normalized = status.toLowerCase()
  if (normalized === "hired") return "text-emerald-700 dark:text-emerald-300"
  if (normalized === "offer") return "text-violet-700 dark:text-violet-300"
  if (normalized === "requested" || normalized === "applied") return "text-amber-700 dark:text-amber-300"
  if (["open", "screening", "interview"].includes(normalized)) return "text-sky-700 dark:text-sky-300"
  if (normalized === "rejected" || normalized === "closed") return "text-destructive"
  return "text-muted-foreground"
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-label font-semibold">{label}</span>
      {children}
    </label>
  )
}

function Modal({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button type="button" aria-label="Close dialog" className="absolute inset-0 bg-slate-950/45" onClick={onClose} />
      <section role="dialog" aria-modal="true" aria-label={title} className="relative max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-lg border border-border bg-background shadow-xl">
        <header className="border-b border-border px-5 py-4 pr-14">
          <h2 className="text-section font-semibold">{title}</h2>
          <p className="mt-0.5 text-description text-muted-foreground">{description}</p>
        </header>
        <button type="button" aria-label="Close" onClick={onClose} className="absolute right-5 top-5 text-muted-foreground hover:text-foreground">
          <X className="size-4" />
        </button>
        {children}
      </section>
    </div>
  )
}

function ActivityList({ rows, empty }: { rows: HiringActivity[]; empty: string }) {
  return rows.length ? (
    <div className="divide-y divide-border/70">
      {rows.slice(0, 6).map((row) => (
        <div key={row.id} className="py-3 first:pt-0 last:pb-0">
          <p className="text-body">{row.detail}</p>
          <p className="mt-0.5 text-meta text-muted-foreground">{row.actorEmail} · {formatWorkspaceDateTime(row.createdAt)}</p>
        </div>
      ))}
    </div>
  ) : <p className="py-4 text-body text-muted-foreground">{empty}</p>
}

function AddCandidateDialog({ requisitions, initialRequisitionId, onClose, onSaved }: { requisitions: HiringRequisition[]; initialRequisitionId: string; onClose: () => void; onSaved: (message: string) => Promise<void> }) {
  const [requisitionId, setRequisitionId] = useState(initialRequisitionId)
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [source, setSource] = useState("Careers site")
  const [notes, setNotes] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError("")
    try {
      const response = await fetch("/api/v1/hr/hiring/candidates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requisitionId, fullName, email, source, notes }),
      })
      const result = await response.json() as { error?: string; message?: string }
      if (!response.ok) throw new Error(result.error || "Candidate could not be added.")
      await onSaved(result.message || "Candidate added.")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Candidate could not be added.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Add candidate" description="Create a candidate record against an approved requisition." onClose={onClose}>
      <form onSubmit={submit} className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Requisition">
          <select required value={requisitionId} onChange={(event) => setRequisitionId(event.target.value)} className={fieldClass}>
            {requisitions.map((item) => <option key={item.id} value={item.id}>{item.position} · {item.location}</option>)}
          </select>
        </Field>
        <Field label="Source">
          <select value={source} onChange={(event) => setSource(event.target.value)} className={fieldClass}>
            {candidateSources.map((item) => <option key={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="Candidate name">
          <input required value={fullName} onChange={(event) => setFullName(event.target.value)} className={fieldClass} />
        </Field>
        <Field label="Email">
          <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={fieldClass} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Recruiter note">
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} className={textareaClass} placeholder="Relevant context for the recruiting team" />
          </Field>
        </div>
        {error && <p role="alert" className="text-meta text-destructive sm:col-span-2">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-border pt-4 sm:col-span-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" disabled={busy || !requisitionId}>
            {busy && <LoaderCircle className="size-4 animate-spin" />}
            Add candidate
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function CandidateUpdateDialog({ candidate, activity, onClose, onSaved }: { candidate: HiringCandidate; activity: HiringActivity[]; onClose: () => void; onSaved: (message: string) => Promise<void> }) {
  const [stage, setStage] = useState<HiringCandidateStage>(candidate.stage)
  const [nextStep, setNextStep] = useState(candidate.nextStep)
  const [nextStepDueAt, setNextStepDueAt] = useState(candidate.nextStepDueAt ?? "")
  const [notes, setNotes] = useState(candidate.notes || "")
  const [rejectedReason, setRejectedReason] = useState(candidate.rejectedReason || "")
  const [startDate, setStartDate] = useState(dateAfterToday(14))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  function chooseStage(value: HiringCandidateStage) {
    const defaults = candidateDefaults(value)
    setStage(value)
    setNextStep(defaults.nextStep)
    setNextStepDueAt(defaults.dueDate)
    if (value !== "Rejected") setRejectedReason("")
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError("")
    try {
      const response = await fetch(`/api/v1/hr/hiring/candidates/${encodeURIComponent(candidate.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stage, nextStep, nextStepDueAt: nextStepDueAt || null, startDate: stage === "Hired" ? startDate : undefined, notes, rejectedReason: rejectedReason || undefined }),
      })
      const result = await response.json() as { error?: string; message?: string }
      if (!response.ok) throw new Error(result.error || "Candidate could not be updated.")
      await onSaved(result.message || "Candidate updated.")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Candidate could not be updated.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Record recruiting outcome" description={`${candidate.fullName} · ${candidate.requisitionTitle}`} onClose={onClose}>
      <form onSubmit={submit} className="grid gap-4 p-5 sm:grid-cols-2">
        <div className="rounded-md border border-border bg-muted/25 p-3 sm:col-span-2">
          <p className="text-card-title font-semibold">Current stage: {candidate.stage}</p>
          <p className="mt-0.5 text-meta text-muted-foreground">{candidate.email} · {candidate.ownerName}</p>
        </div>
        <Field label="Outcome">
          <select value={stage} onChange={(event) => chooseStage(event.target.value as HiringCandidateStage)} className={fieldClass}>
            {candidateStageOptions(candidate.stage).map((item) => <option key={item}>{item}</option>)}
          </select>
        </Field>
        {stage === "Hired" ? <Field label="Planned start date">
          <input required type="date" min={new Date().toISOString().slice(0, 10)} value={startDate} onChange={(event) => setStartDate(event.target.value)} className={fieldClass} />
        </Field> : <Field label="Follow-up date">
          <input type="date" value={nextStepDueAt} onChange={(event) => setNextStepDueAt(event.target.value)} className={fieldClass} disabled={stage === "Rejected"} />
        </Field>}
        {stage !== "Hired" && <div className="sm:col-span-2">
          <Field label="Next action">
            <input required value={nextStep} onChange={(event) => setNextStep(event.target.value)} className={fieldClass} />
          </Field>
        </div>}
        {stage === "Rejected" && (
          <div className="sm:col-span-2">
            <Field label="Rejection reason">
              <input required value={rejectedReason} onChange={(event) => setRejectedReason(event.target.value)} className={fieldClass} />
            </Field>
          </div>
        )}
        <div className="sm:col-span-2">
          <Field label="Recruiter note">
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} className={textareaClass} />
          </Field>
        </div>
        {stage === "Hired" && (
          <p className="rounded-md border border-border bg-muted/25 px-3 py-2 text-meta sm:col-span-2">
            Saving creates a preboarding employee profile, fills the requisition, and closes the remaining candidates as position filled.
          </p>
        )}
        {error && <p role="alert" className="text-meta text-destructive sm:col-span-2">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-border pt-4 sm:col-span-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" disabled={busy}>
            {busy && <LoaderCircle className="size-4 animate-spin" />}
            Save recruiting update
          </Button>
        </div>
      </form>
      <div className="border-t border-border px-5 py-4">
        <p className="text-card-title font-semibold">Activity</p>
        <div className="mt-3"><ActivityList rows={activity} empty="No activity has been recorded for this candidate." /></div>
      </div>
    </Modal>
  )
}

function RequisitionDialog({ requisition, activity, busy, onClose, onDecision, onAddCandidate, onSaved }: { requisition: HiringRequisition; activity: HiringActivity[]; busy: boolean; onClose: () => void; onDecision: (action: "approve" | "reject", note?: string) => Promise<void>; onAddCandidate: () => void; onSaved: (message: string, close: boolean) => Promise<void> }) {
  const [nextAction, setNextAction] = useState(requisition.nextAction)
  const [dueDate, setDueDate] = useState(requisition.dueDate ?? dateAfterToday(7))
  const [note, setNote] = useState("")
  const [closing, setClosing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [declining, setDeclining] = useState(false)
  const [declineReason, setDeclineReason] = useState("")

  async function update(action: "follow_up" | "close") {
    setSaving(true)
    setError("")
    try {
      const response = await fetch(`/api/v1/hr/hiring/requisitions/${encodeURIComponent(requisition.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, nextAction, dueDate, note }),
      })
      const result = await response.json() as { error?: string; message?: string }
      if (!response.ok) throw new Error(result.error || "Requisition could not be updated.")
      await onSaved(result.message || "Requisition updated.", action === "close")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Requisition could not be updated.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={requisition.position} description={`${requisition.department} · ${requisition.location} · ${requisition.employmentType}`} onClose={onClose}>
      <div className="grid gap-4 p-5 sm:grid-cols-3">
        <div>
          <p className="text-label font-semibold text-muted-foreground">Status</p>
          <p className={cn("mt-1 text-card-title font-semibold", statusTone(requisition.status))}>{requisition.status}</p>
        </div>
        <div>
          <p className="text-label font-semibold text-muted-foreground">Owner</p>
          <p className="mt-1 text-body">{requisition.ownerName}</p>
        </div>
        <div>
          <p className="text-label font-semibold text-muted-foreground">Pipeline</p>
          <p className="mt-1 text-body">{requisition.activeCandidateCount} active · {requisition.interviewCount} interview · {requisition.offerCount} offer</p>
        </div>
        <div className="sm:col-span-3">
          <p className="text-label font-semibold text-muted-foreground">Business justification</p>
          <p className="mt-1 text-body">{requisition.justification}</p>
        </div>
      </div>

      {requisition.canDecide && (
        <div className="border-t border-border px-5 py-4">
          <p className="text-card-title font-semibold">Headcount decision</p>
          <p className="mt-1 text-meta text-muted-foreground">Approve to open recruiting, or decline to close the request.</p>
          {declining ? (
            <form className="mt-4 space-y-3" onSubmit={(event) => { event.preventDefault(); void onDecision("reject", declineReason) }}>
              <Field label="Reason for declining">
                <textarea required minLength={10} value={declineReason} onChange={(event) => setDeclineReason(event.target.value)} className={textareaClass} placeholder="Record the reason for the requester and audit history" />
              </Field>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" disabled={busy} onClick={() => { setDeclining(false); setDeclineReason("") }}>Cancel</Button>
                <Button type="submit" variant="destructive" disabled={busy || declineReason.trim().length < 10}>{busy && <LoaderCircle className="size-4 animate-spin" />}Decline request</Button>
              </div>
            </form>
          ) : (
            <div className="mt-4 flex gap-2">
              <Button variant="outline" disabled={busy} onClick={() => setDeclining(true)}>Decline request</Button>
              <Button disabled={busy} onClick={() => void onDecision("approve")}>
                {busy && <LoaderCircle className="size-4 animate-spin" />}
                Approve and open
              </Button>
            </div>
          )}
        </div>
      )}

      {requisition.canManage && !closing && (
        <form onSubmit={(event) => { event.preventDefault(); void update("follow_up") }} className="grid gap-4 border-t border-border p-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <p className="text-card-title font-semibold">Next recruiting action</p>
            <p className="mt-0.5 text-meta text-muted-foreground">Update the accountable action and follow-up date stored with this requisition.</p>
          </div>
          <div className="sm:col-span-2">
            <Field label="Next action">
              <input required value={nextAction} onChange={(event) => setNextAction(event.target.value)} className={fieldClass} />
            </Field>
          </div>
          <Field label="Follow-up date">
            <input required type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className={fieldClass} />
          </Field>
          <Field label="Internal note">
            <input value={note} onChange={(event) => setNote(event.target.value)} className={fieldClass} placeholder="Optional context" />
          </Field>
          {error && <p role="alert" className="text-meta text-destructive sm:col-span-2">{error}</p>}
          <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-4 sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => setClosing(true)}>Close requisition</Button>
            <div className="flex gap-2">
              {requisition.canAddCandidate && <Button type="button" variant="outline" onClick={onAddCandidate}>Add candidate</Button>}
              <Button type="submit" disabled={saving}>
                {saving && <LoaderCircle className="size-4 animate-spin" />}
                Save next action
              </Button>
            </div>
          </div>
        </form>
      )}

      {requisition.canManage && closing && (
        <form onSubmit={(event) => { event.preventDefault(); void update("close") }} className="border-t border-border p-5">
          <p className="text-card-title font-semibold">Close requisition</p>
          <p className="mt-1 text-meta text-muted-foreground">Active candidates will be closed with the reason “Requisition closed”.</p>
          <div className="mt-4">
            <Field label="Closure reason">
              <textarea required value={note} onChange={(event) => setNote(event.target.value)} className={textareaClass} />
            </Field>
          </div>
          {error && <p role="alert" className="mt-3 text-meta text-destructive">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setClosing(false)}>Cancel</Button>
            <Button type="submit" variant="destructive" disabled={saving}>
              {saving && <LoaderCircle className="size-4 animate-spin" />}
              Close requisition
            </Button>
          </div>
        </form>
      )}

      <div className="border-t border-border px-5 py-4">
        <p className="text-card-title font-semibold">Activity</p>
        <div className="mt-3"><ActivityList rows={activity} empty="No activity has been recorded for this requisition." /></div>
      </div>
    </Modal>
  )
}

export function HiringWorkspace({ canRequestHiring, basePath = "/hiring", initialData }: { canRequestHiring: boolean; basePath?: string; initialData?: HiringOperations }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const selectedFromUrl = searchParams.get("requisition")
  const selectedCandidateId = searchParams.get("candidateRecord")
  const showCandidateForm = searchParams.get("newCandidate") === "1"
  const candidateRequisitionId = searchParams.get("candidateRequisition") ?? ""
  const returnTo = safeReturnTo(searchParams.get("returnTo"))
  const initialStatus = searchParams.get("status")
  const initialCandidateFilter = searchParams.get("candidate") === "overdue" ? "overdue" : "active"
  const [data, setData] = useState<HiringOperations | null>(initialData ?? null)
  const [loading, setLoading] = useState(!initialData)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [busyId, setBusyId] = useState<string | null>(null)
  const [query, setQuery] = useState(searchParams.get("q") ?? "")
  const [status, setStatus] = useState(initialStatus || "active")
  const [department, setDepartment] = useState(searchParams.get("department") ?? "")
  const [location, setLocation] = useState(searchParams.get("location") ?? "")
  const [candidateQuery, setCandidateQuery] = useState(searchParams.get("candidateQ") ?? "")
  const [candidateStage, setCandidateStage] = useState(initialCandidateFilter)
  const [workspaceView, setWorkspaceView] = useState<"requisitions" | "candidates">(
    searchParams.has("candidate") || searchParams.has("candidateQ") || selectedCandidateId ? "candidates" : "requisitions",
  )

  const listHref = useMemo(() => {
    const params = new URLSearchParams()
    if (basePath === "/onboarding") params.set("view", "talent")
    if (query.trim()) params.set("q", query.trim())
    if (status !== "active") params.set("status", status)
    if (department) params.set("department", department)
    if (location) params.set("location", location)
    if (candidateQuery.trim()) params.set("candidateQ", candidateQuery.trim())
    if (candidateStage !== "active") params.set("candidate", candidateStage)
    if (returnTo) params.set("returnTo", returnTo)
    return `${basePath}${params.size ? `?${params.toString()}` : ""}`
  }, [basePath, candidateQuery, candidateStage, department, location, query, returnTo, status])

  useEffect(() => {
    if (selectedFromUrl || selectedCandidateId || showCandidateForm) return
    const current = `${basePath}${searchParams.size ? `?${searchParams.toString()}` : ""}`
    if (current !== listHref) router.replace(listHref, { scroll: false })
  }, [basePath, listHref, router, searchParams, selectedCandidateId, selectedFromUrl, showCandidateForm])

  async function loadOperations(message = "") {
    setLoading(true)
    setError("")
    try {
      const response = await fetch("/api/v1/hr/hiring", { cache: "no-store" })
      const result = await response.json() as HiringOperations & { error?: string }
      if (!response.ok) throw new Error(result.error || "Hiring operations could not be loaded.")
      setData(result)
      setNotice(message)
      if (message) window.setTimeout(() => setNotice(""), 3200)
      router.refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Hiring operations could not be loaded.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (initialData) return
    const controller = new AbortController()
    fetch("/api/v1/hr/hiring", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json() as HiringOperations & { error?: string }
        if (!response.ok) throw new Error(result.error || "Hiring operations could not be loaded.")
        return result
      })
      .then((result) => setData(result))
      .catch((reason: unknown) => {
        if ((reason as { name?: string })?.name !== "AbortError") setError(reason instanceof Error ? reason.message : "Hiring operations could not be loaded.")
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [initialData])

  const departments = useMemo(() => data ? [...new Set(data.requisitions.map((item) => item.department))].sort() : [], [data])
  const locations = useMemo(() => data ? [...new Set(data.requisitions.map((item) => item.location))].sort() : [], [data])
  const visibleRequisitions = useMemo(() => {
    if (!data) return []
    const normalized = query.trim().toLowerCase()
    return data.requisitions.filter((item) => (
      (status === "all" || status === "active" ? status !== "active" || activeStatuses.has(item.status) : item.status === status)
      && (!department || item.department === department)
      && (!location || item.location === location)
      && (!normalized || [item.position, item.department, item.location, item.ownerName, item.id].some((value) => value.toLowerCase().includes(normalized)))
    ))
  }, [data, department, location, query, status])
  const selectedRequisition = data?.requisitions.find((item) => item.id === selectedFromUrl) ?? null
  const selectedCandidate = data?.candidates.find((item) => item.id === selectedCandidateId) ?? null
  const activeRequisitions = data?.requisitions.filter((item) => item.canAddCandidate) ?? []
  const visibleCandidates = useMemo(() => {
    if (!data) return []
    const normalized = candidateQuery.trim().toLowerCase()
    return data.candidates.filter((candidate) => (
      (!selectedFromUrl || candidate.requisitionId === selectedFromUrl)
      && (!department || candidate.department === department)
      && (!location || candidate.location === location)
      && (candidateStage === "all"
        || candidateStage === "active" && activeCandidateStages.has(candidate.stage)
        || candidateStage === "overdue" && candidate.isOverdue
        || candidate.stage === candidateStage)
      && (!normalized || [candidate.fullName, candidate.email, candidate.requisitionTitle, candidate.ownerName].some((value) => value.toLowerCase().includes(normalized)))
    ))
  }, [candidateQuery, candidateStage, data, department, location, selectedFromUrl])
  const requisitionActivity = useMemo(() => data?.recentActivity.filter((item) => item.requisitionId === selectedRequisition?.id) ?? [], [data, selectedRequisition?.id])
  const candidateActivity = useMemo(() => data?.recentActivity.filter((item) => item.entityType === "candidate" && item.entityId === selectedCandidate?.id) ?? [], [data, selectedCandidate?.id])

  function selectRequisition(id: string | null) {
    if (!id) {
      router.replace(listHref, { scroll: false })
      return
    }
    const params = new URLSearchParams(listHref.split("?")[1] ?? "")
    params.set("requisition", id)
    router.push(`${basePath}?${params.toString()}`, { scroll: false })
  }

  function openCandidateForm(requisitionId: string) {
    const params = new URLSearchParams(listHref.split("?")[1] ?? "")
    params.set("newCandidate", "1")
    params.set("candidateRequisition", requisitionId)
    router.push(`${basePath}?${params.toString()}`, { scroll: false })
  }

  function openCandidateRecord(candidateId: string) {
    const params = new URLSearchParams(listHref.split("?")[1] ?? "")
    params.set("candidateRecord", candidateId)
    router.push(`${basePath}?${params.toString()}`, { scroll: false })
  }

  function closeRequisition() {
    if (returnTo) {
      router.push(returnTo)
      return
    }
    router.replace(listHref, { scroll: false })
  }

  async function decideRequisition(requisition: HiringRequisition, action: "approve" | "reject", note = "") {
    setBusyId(requisition.id)
    setError("")
    try {
      const response = await fetch("/api/v1/hr/workflows/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: requisition.id, type: "hiring", action, note }),
      })
      const result = await response.json() as { error?: string; message?: string }
      if (!response.ok) throw new Error(result.error || "The requisition could not be updated.")
      if (action === "reject") closeRequisition()
      await loadOperations(result.message || "Requisition updated.")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The requisition could not be updated.")
    } finally {
      setBusyId(null)
    }
  }

  if (!data && loading) return <div className="space-y-4"><div className="h-32 animate-pulse rounded-lg bg-muted" /><div className="h-96 animate-pulse rounded-lg bg-muted" /></div>
  if (!data) return <Card><CardContent className="p-6 text-body text-destructive">{error || "Hiring operations could not be loaded."}</CardContent></Card>

  return (
    <WorkspacePage>
      <WorkspaceHeader title={basePath === "/onboarding" ? "Onboarding" : "Talent acquisition"} description="Headcount approval and candidate handoff." actions={
          <>
            {canRequestHiring && <Button nativeButton={false} variant="outline" render={<Link href={`/inbox?new=hiring&returnTo=${encodeURIComponent(basePath === "/onboarding" ? "/onboarding?view=talent" : basePath)}`} />}><Plus className="size-4" />New requisition</Button>}
            <Button onClick={() => openCandidateForm(activeRequisitions[0]?.id ?? "")} disabled={!activeRequisitions.length}><Plus className="size-4" />Add candidate</Button>
          </>}/>

      {basePath === "/onboarding" && <div className="flex border-b border-border" role="tablist" aria-label="Onboarding stages">
        <Link href="/onboarding" className="-mb-px border-b-2 border-transparent px-4 py-2.5 font-semibold text-muted-foreground hover:text-foreground">New joiners</Link>
        <Link href="/onboarding?view=talent" aria-current="page" className="-mb-px border-b-2 border-primary px-4 py-2.5 font-semibold">Talent acquisition</Link>
      </div>}

      {(notice || error) && (
        <div aria-live="polite" className={cn("rounded-md border px-4 py-3 text-meta", error ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-200" : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-200")}>
          {error || notice}
        </div>
      )}

      <MetricStrip metrics={[
          { label: "Awaiting approval", value: data.summary.approvalsRequired, detail: "Headcount requests" },
          { label: "Active roles", value: data.summary.activeRequisitions, detail: "Requested, open, or offer" },
          { label: "Overdue", value: data.summary.overdueFollowUps, detail: "Recruiting follow-ups" },
          { label: "Time to fill", value: `${data.summary.averageTimeToFill}d`, detail: "Recent hires" },
        ]}/>

      <div className="flex border-b border-border" role="tablist" aria-label="Talent acquisition views">
        <button type="button" role="tab" aria-selected={workspaceView === "requisitions"} onClick={() => setWorkspaceView("requisitions")} className={cn("-mb-px border-b-2 px-4 py-2.5 font-semibold", workspaceView === "requisitions" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>Requisitions <span className="ml-1 text-meta tabular-nums">{visibleRequisitions.length}</span></button>
        <button type="button" role="tab" aria-selected={workspaceView === "candidates"} onClick={() => setWorkspaceView("candidates")} className={cn("-mb-px border-b-2 px-4 py-2.5 font-semibold", workspaceView === "candidates" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>Candidates <span className="ml-1 text-meta tabular-nums">{visibleCandidates.length}</span></button>
      </div>

      {workspaceView === "requisitions" && <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <CardHeader className="gap-4 border-b border-border px-5 py-4">
          <div>
            <CardTitle>Requisition queue</CardTitle>
            <CardDescription>Open and requested roles.</CardDescription>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_170px_200px_180px]">
            <label className="relative">
              <span className="sr-only">Search requisitions</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search role, department, or owner" className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-control outline-none focus:ring-2 focus:ring-ring/30" />
            </label>
            <label><span className="sr-only">Requisition status</span><select value={status} onChange={(event) => setStatus(event.target.value)} className={fieldClass}><option value="active">Active requisitions</option><option value="all">All statuses</option><option value="Requested">Requested</option><option value="Open">Open</option><option value="Offer">Offer</option><option value="Hired">Hired</option><option value="Closed">Closed</option></select></label>
            <label><span className="sr-only">Department</span><select value={department} onChange={(event) => setDepartment(event.target.value)} className={fieldClass}><option value="">All departments</option>{departments.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span className="sr-only">Location</span><select value={location} onChange={(event) => setLocation(event.target.value)} className={fieldClass}><option value="">All locations</option>{locations.map((item) => <option key={item}>{item}</option>)}</select></label>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-body">
              <thead className="bg-muted/40 text-label font-semibold text-muted-foreground"><tr>{["Role", "Status", "Pipeline", "Owner", "Next action", "Due", ""].map((heading) => <th key={heading} className="px-4 py-2.5">{heading}</th>)}</tr></thead>
              <tbody>{visibleRequisitions.map((item) => (
                <tr key={item.id} className="border-t border-border/70 hover:bg-muted/20">
                  <td className="px-4 py-3"><button type="button" onClick={() => selectRequisition(item.id)} className="text-left"><span className="block font-semibold hover:text-primary">{item.position}</span><span className="mt-0.5 block text-meta text-muted-foreground">{item.department} · {item.location}</span></button></td>
                  <td className="px-4 py-3"><span className={cn("text-status font-semibold", statusTone(item.status))}>{item.status}</span></td>
                  <td className="px-4 py-3"><span className="font-semibold tabular-nums">{item.activeCandidateCount}</span><span className="ml-1 text-meta text-muted-foreground">active</span></td>
                  <td className="px-4 py-3"><p>{item.ownerName}</p><p className="text-meta text-muted-foreground">{item.ageDays} days open</p></td>
                  <td className="max-w-xs px-4 py-3 text-muted-foreground">{item.nextAction}</td>
                  <td className={cn("px-4 py-3 whitespace-nowrap", item.dueDate && item.dueDate < new Date().toISOString().slice(0, 10) && activeStatuses.has(item.status) ? "font-semibold text-destructive" : "text-muted-foreground")}>{formatDate(item.dueDate)}</td>
                  <td className="px-4 py-3 text-right"><Button size="xs" variant={item.canDecide ? "default" : "outline"} onClick={() => selectRequisition(item.id)}>{item.canDecide ? "Decide" : item.canManage ? "Manage" : "View"}</Button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {!visibleRequisitions.length && <p className="p-10 text-center text-body text-muted-foreground">No requisitions match these filters.</p>}
          <div className="border-t border-border bg-muted/20 px-4 py-2.5 text-meta text-muted-foreground">Showing {visibleRequisitions.length} of {data.requisitions.length} requisitions</div>
        </CardContent>
      </Card>}

      {workspaceView === "candidates" && <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <CardHeader className="gap-4 border-b border-border px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle>Candidate pipeline</CardTitle>
            <CardDescription>{selectedRequisition ? `Candidates for ${selectedRequisition.position}` : "Candidate follow-ups across active requisitions."}</CardDescription>
          </div>
          <div className="grid gap-2 sm:grid-cols-[240px_160px]">
            <label className="relative"><span className="sr-only">Search candidates</span><Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><input value={candidateQuery} onChange={(event) => setCandidateQuery(event.target.value)} placeholder="Search candidate or role" className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-control outline-none focus:ring-2 focus:ring-ring/30" /></label>
            <label><span className="sr-only">Candidate status</span><select value={candidateStage} onChange={(event) => setCandidateStage(event.target.value)} className={fieldClass}><option value="active">Active candidates</option><option value="overdue">Overdue follow-ups</option><option value="Applied">Applied</option><option value="Screening">Screening</option><option value="Interview">Interview</option><option value="Offer">Offer</option><option value="Hired">Hired</option><option value="Rejected">Rejected</option><option value="all">All candidates</option></select></label>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left text-body">
              <thead className="bg-muted/40 text-label font-semibold text-muted-foreground"><tr>{["Candidate", "Role", "Stage", "Owner", "Next action", "Due", ""].map((heading) => <th key={heading} className="px-4 py-2.5">{heading}</th>)}</tr></thead>
              <tbody>{visibleCandidates.map((candidate) => (
                <tr key={candidate.id} className="border-t border-border/70 hover:bg-muted/20">
                  <td className="px-4 py-3"><p className="font-semibold">{candidate.fullName}</p><p className="text-meta text-muted-foreground">{candidate.email} · {candidate.source}</p></td>
                  <td className="px-4 py-3"><button type="button" className="text-left hover:text-primary" onClick={() => selectRequisition(candidate.requisitionId)}>{candidate.requisitionTitle}<span className="block text-meta text-muted-foreground">{candidate.location}</span></button></td>
                  <td className="px-4 py-3"><span className={cn("text-status font-semibold", statusTone(candidate.stage))}>{candidate.stage}</span></td>
                  <td className="px-4 py-3">{candidate.ownerName}</td>
                  <td className="max-w-xs px-4 py-3 text-muted-foreground">{candidate.nextStep}</td>
                  <td className={cn("px-4 py-3 whitespace-nowrap", candidate.isOverdue ? "font-semibold text-destructive" : "text-muted-foreground")}>{formatDate(candidate.nextStepDueAt)}</td>
                  <td className="px-4 py-3 text-right">{candidate.canUpdate ? <Button size="xs" variant="outline" onClick={() => openCandidateRecord(candidate.id)}>Record outcome</Button> : <span className="text-meta text-muted-foreground">View only</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {!visibleCandidates.length && <p className="p-10 text-center text-body text-muted-foreground">No candidates match this view.</p>}
          <div className="border-t border-border bg-muted/20 px-4 py-2.5 text-meta text-muted-foreground">Showing {visibleCandidates.length} of {data.candidates.length} candidates</div>
        </CardContent>
      </Card>}

      {showCandidateForm && (
        <AddCandidateDialog
          requisitions={activeRequisitions}
          initialRequisitionId={candidateRequisitionId || activeRequisitions[0]?.id || ""}
          onClose={closeRequisition}
          onSaved={async (message) => { closeRequisition(); await loadOperations(message) }}
        />
      )}
      {selectedCandidate && (
        <CandidateUpdateDialog
          key={selectedCandidate.id}
          candidate={selectedCandidate}
          activity={candidateActivity}
          onClose={closeRequisition}
          onSaved={async (message) => { closeRequisition(); await loadOperations(message) }}
        />
      )}
      {selectedRequisition && (
        <RequisitionDialog
          key={`${selectedRequisition.id}-${selectedRequisition.status}-${selectedRequisition.dueDate}-${selectedRequisition.nextAction}`}
          requisition={selectedRequisition}
          activity={requisitionActivity}
          busy={busyId === selectedRequisition.id}
          onClose={closeRequisition}
          onDecision={(action, note) => decideRequisition(selectedRequisition, action, note)}
          onAddCandidate={() => openCandidateForm(selectedRequisition.id)}
          onSaved={async (message, close) => { if (close) closeRequisition(); await loadOperations(message) }}
        />
      )}
    </WorkspacePage>
  )
}
