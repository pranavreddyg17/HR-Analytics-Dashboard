"use client"

import { useMemo, useState } from "react"
import { BriefcaseBusiness, CalendarPlus, GraduationCap, LoaderCircle, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { ManagedEmployee, WorkflowActorContext } from "@/lib/people-types"

type WorkflowType = "leave" | "hiring" | "training"

const inputClass = "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
const textareaClass = "min-h-24 w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
const today = () => new Date().toISOString().slice(0, 10)

export function WorkflowCreator({ actor, people, onCreated }: { actor: WorkflowActorContext; people: ManagedEmployee[]; onCreated: (message: string) => void }) {
  const [type, setType] = useState<WorkflowType | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [leave, setLeave] = useState({ employeeId: actor.employeeId ?? people[0]?.employee_id ?? "", leaveType: "Annual", startDate: today(), endDate: today(), note: "" })
  const [hiring, setHiring] = useState({ position: "", department: "", location: "", employmentType: "Full-time", justification: "" })
  const [training, setTraining] = useState({ employeeId: people[0]?.employee_id ?? "", program: "", dueDate: today(), hours: "1", note: "" })
  const trainingPeople = useMemo(() => actor.role === "manager" ? people.filter((person) => person.manager_id === actor.employeeId) : people, [actor, people])
  const canRequestLeave = Boolean(actor.employeeId || (["admin", "hr"].includes(actor.role) && people.length))

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!type) return
    setSaving(true)
    setError("")
    const payload = type === "leave"
      ? { type, ...leave }
      : type === "hiring"
        ? { type, ...hiring }
        : { type, ...training, hours: Number(training.hours) }
    try {
      const response = await fetch("/api/v1/hr/workflows", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) })
      const result = await response.json() as { error?: string; message?: string }
      if (!response.ok) throw new Error(result.error ?? "The request could not be saved.")
      setType(null)
      onCreated(result.message ?? "Workflow created.")
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The request could not be saved.")
    } finally {
      setSaving(false)
    }
  }

  const cards = [
    { type: "leave" as const, title: "Request leave", detail: actor.employeeName ? `Submit for ${actor.employeeName}` : "Requires a linked employee profile", icon: CalendarPlus, enabled: canRequestLeave },
    { type: "hiring" as const, title: "Request a position", detail: "Send a hiring requisition to HR", icon: BriefcaseBusiness, enabled: actor.canRequestHiring },
    { type: "training" as const, title: "Assign training", detail: "Create a tracked employee assignment", icon: GraduationCap, enabled: actor.canAssignTraining && trainingPeople.length > 0 },
  ]

  return (
    <>
      <section className="grid gap-3 md:grid-cols-3" aria-label="Create HR workflow">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <button key={card.type} type="button" disabled={!card.enabled} onClick={() => { setError(""); setType(card.type) }} className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:translate-y-0">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="size-[18px]" /></span>
              <span className="min-w-0"><span className="block text-sm font-semibold">{card.title}</span><span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">{card.detail}</span></span>
            </button>
          )
        })}
      </section>

      {type && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button type="button" aria-label="Close workflow form" className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={() => !saving && setType(null)} />
          <form onSubmit={submit} className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-3xl border border-border bg-background p-6 shadow-2xl">
            <button type="button" aria-label="Close" onClick={() => setType(null)} className="absolute right-5 top-5 text-muted-foreground hover:text-foreground"><X className="size-4" /></button>
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-primary">New workflow</p>
            <h3 className="mt-1 text-xl font-bold tracking-tight">{type === "leave" ? "Request leave" : type === "hiring" ? "Request a new position" : "Assign training"}</h3>
            <p className="mt-1 text-sm text-muted-foreground">This creates a real database record and adds the relevant action to Inbox.</p>

            <div className="mt-6 space-y-4">
              {type === "leave" && (
                <>
                  {["admin", "hr"].includes(actor.role) && <SelectEmployee value={leave.employeeId} people={people} onChange={(employeeId) => setLeave((current) => ({ ...current, employeeId }))} />}
                  <Field label="Leave type"><select className={inputClass} value={leave.leaveType} onChange={(event) => setLeave((current) => ({ ...current, leaveType: event.target.value }))}>{["Annual", "Sick", "Parental", "Personal", "Caregiver", "Unpaid"].map((value) => <option key={value}>{value}</option>)}</select></Field>
                  <div className="grid gap-4 sm:grid-cols-2"><Field label="Start date"><input required type="date" className={inputClass} value={leave.startDate} onChange={(event) => setLeave((current) => ({ ...current, startDate: event.target.value }))} /></Field><Field label="End date"><input required type="date" className={inputClass} value={leave.endDate} onChange={(event) => setLeave((current) => ({ ...current, endDate: event.target.value }))} /></Field></div>
                  <Field label="Note (optional)"><textarea className={textareaClass} value={leave.note} onChange={(event) => setLeave((current) => ({ ...current, note: event.target.value }))} placeholder="Context for your manager" /></Field>
                </>
              )}
              {type === "hiring" && (
                <>
                  <Field label="Position"><input required className={inputClass} value={hiring.position} onChange={(event) => setHiring((current) => ({ ...current, position: event.target.value }))} placeholder="Product Designer" /></Field>
                  <div className="grid gap-4 sm:grid-cols-2"><Field label="Department"><input required className={inputClass} value={hiring.department} onChange={(event) => setHiring((current) => ({ ...current, department: event.target.value }))} placeholder="Product" /></Field><Field label="Location"><input required className={inputClass} value={hiring.location} onChange={(event) => setHiring((current) => ({ ...current, location: event.target.value }))} placeholder="Remote" /></Field></div>
                  <Field label="Employment type"><select className={inputClass} value={hiring.employmentType} onChange={(event) => setHiring((current) => ({ ...current, employmentType: event.target.value }))}>{["Full-time", "Part-time", "Contract", "Intern", "Temporary"].map((value) => <option key={value}>{value}</option>)}</select></Field>
                  <Field label="Business justification"><textarea required minLength={10} className={textareaClass} value={hiring.justification} onChange={(event) => setHiring((current) => ({ ...current, justification: event.target.value }))} placeholder="Why the team needs this position" /></Field>
                </>
              )}
              {type === "training" && (
                <>
                  <SelectEmployee value={training.employeeId} people={trainingPeople} onChange={(employeeId) => setTraining((current) => ({ ...current, employeeId }))} />
                  <Field label="Training programme"><input required className={inputClass} value={training.program} onChange={(event) => setTraining((current) => ({ ...current, program: event.target.value }))} placeholder="Security and privacy essentials" /></Field>
                  <div className="grid gap-4 sm:grid-cols-2"><Field label="Due date"><input required type="date" className={inputClass} value={training.dueDate} onChange={(event) => setTraining((current) => ({ ...current, dueDate: event.target.value }))} /></Field><Field label="Estimated hours"><input required min="0.5" max="500" step="0.5" type="number" className={inputClass} value={training.hours} onChange={(event) => setTraining((current) => ({ ...current, hours: event.target.value }))} /></Field></div>
                  <Field label="Instructions (optional)"><textarea className={textareaClass} value={training.note} onChange={(event) => setTraining((current) => ({ ...current, note: event.target.value }))} placeholder="Completion requirements or course link" /></Field>
                </>
              )}
            </div>

            {error && <p role="alert" className="mt-4 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">{error}</p>}
            <div className="mt-6 flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setType(null)} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving}>{saving && <LoaderCircle className="size-4 animate-spin" />}{type === "leave" ? "Submit request" : type === "hiring" ? "Send to HR" : "Assign training"}</Button></div>
          </form>
        </div>
      )}
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-semibold">{label}</span>{children}</label>
}

function SelectEmployee({ value, people, onChange }: { value: string; people: ManagedEmployee[]; onChange: (value: string) => void }) {
  return <Field label="Employee"><select required className={inputClass} value={value} onChange={(event) => onChange(event.target.value)}><option value="">Choose an employee</option>{people.map((person) => <option key={person.employee_id} value={person.employee_id}>{person.display_name} · {person.department}</option>)}</select></Field>
}
