"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronRight, Mail, MapPin, Save, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PersonAvatar } from "@/components/people/people-ui"
import type { EmployeeInput, ManagedEmployee } from "@/lib/people-types"
import { cn } from "@/lib/utils"

const employmentTypes = ["Full-time", "Part-time", "Contract", "Intern", "Temporary"]
const employmentStatuses = ["Preboarding", "Active", "On Bench", "Notice Period", "Scheduled Exit", "On leave", "Terminated", "Resigned"]

const emptyEmployee = (): EmployeeInput => ({
  employee_id: "",
  first_name: "",
  last_name: "",
  preferred_name: "",
  work_email: "",
  phone: "",
  department: "",
  job_title: "",
  location: "",
  manager_id: "",
  hire_date: new Date().toISOString().slice(0, 10),
  employment_type: "Full-time",
  employment_status: "Active",
})

function toInput(employee: ManagedEmployee): EmployeeInput {
  return {
    employee_id: employee.employee_id,
    first_name: employee.first_name,
    last_name: employee.last_name,
    preferred_name: employee.preferred_name ?? "",
    work_email: employee.work_email ?? "",
    phone: employee.phone ?? "",
    department: employee.department,
    job_title: employee.job_title,
    location: employee.location,
    manager_id: employee.manager_id ?? "",
    hire_date: employee.hire_date,
    employment_type: employee.employment_type,
    employment_status: employee.employment_status,
    version: employee.version,
  }
}

function fieldLabel(label: string, optional = false) {
  return <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-foreground">{label}{optional && <span className="font-normal text-muted-foreground">Optional</span>}</span>
}

const inputClass = "h-10 rounded-md border-border/80 bg-background px-3 shadow-none focus-visible:ring-2"
const selectClass = "h-10 w-full rounded-md border border-border/80 bg-background px-3 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/20"

type EmployeeDrawerProps = {
  open: boolean
  mode: "create" | "edit"
  employee?: ManagedEmployee | null
  managers: ManagedEmployee[]
  dimensions?: { departments: string[]; locations: string[] }
  onClose: () => void
  onSaved: (employee: ManagedEmployee) => void
}

export function EmployeeDrawer({ open, ...props }: EmployeeDrawerProps) {
  return open ? <EmployeeDrawerPanel {...props} /> : null
}

function EmployeeDrawerPanel({
  mode,
  employee,
  managers,
  dimensions,
  onClose,
  onSaved,
}: Omit<EmployeeDrawerProps, "open">) {
  const [form, setForm] = useState<EmployeeInput>(() => employee ? toInput(employee) : emptyEmployee())
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose() }
    window.addEventListener("keydown", onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose])

  const managerOptions = useMemo(
    () => managers.filter((manager) => !manager.archived_at && manager.employee_id !== employee?.employee_id),
    [employee?.employee_id, managers],
  )

  function update<K extends keyof EmployeeInput>(key: K, value: EmployeeInput[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    setError("")
  }

  function stepValid(index: number): boolean {
    if (index === 0) return Boolean(form.first_name.trim() && form.last_name.trim())
    if (index === 1) return Boolean(form.department.trim() && form.job_title.trim() && form.location.trim())
    return Boolean(form.hire_date && form.employment_type && form.employment_status)
  }

  function goToStep(nextStep: number) {
    if (nextStep <= step) {
      setError("")
      setStep(nextStep)
      return
    }
    if (nextStep === step + 1 && stepValid(step)) {
      setError("")
      setStep(nextStep)
      return
    }
    setError(step === 0 ? "Enter a first and last name before continuing." : "Enter a job title, department, and location before continuing.")
  }

  async function handlePrimaryAction() {
    if (step < 2) {
      if (stepValid(step)) {
        setError("")
        setStep((current) => current + 1)
      } else {
        setError(step === 0 ? "Enter a first and last name to continue." : "Enter a job title, department, and location to continue.")
      }
      return
    }
    setSaving(true)
    setError("")
    try {
      const path = mode === "create"
        ? "/api/v1/hr/people"
        : `/api/v1/hr/people/${encodeURIComponent(employee?.employee_id ?? "")}`
      const response = await fetch(path, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          employee_id: mode === "create" && form.employee_id?.trim() ? form.employee_id.trim() : undefined,
          preferred_name: form.preferred_name || null,
          work_email: form.work_email || null,
          phone: form.phone || null,
          manager_id: form.manager_id || null,
        }),
      })
      const body = await response.json() as ManagedEmployee & { error?: string }
      if (!response.ok) throw new Error(body.error ?? `Unable to ${mode === "create" ? "add" : "update"} employee.`)
      onClose()
      onSaved(body)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save this employee.")
    } finally {
      setSaving(false)
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    void handlePrimaryAction()
  }

  const previewName = `${form.preferred_name || form.first_name || "New"} ${form.last_name || "employee"}`
  const previewInitials = `${(form.preferred_name || form.first_name || "N")[0]}${(form.last_name || "E")[0]}`.toUpperCase()

  return (
    <div className="fixed inset-0 z-[80]">
          <button
            type="button"
            aria-label="Close employee form"
            className="absolute inset-0 bg-slate-950/25"
            onClick={() => { if (!saving) onClose() }}
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="employee-drawer-title"
            className="absolute right-0 top-0 flex h-[100dvh] w-full max-w-xl flex-col overflow-hidden border-l border-border/70 bg-background shadow-none"
          >
            <div className="border-b border-border px-6 pb-5 pt-6">
              <div className="flex items-start gap-4">
                <PersonAvatar employeeId={form.employee_id || "new-person"} initials={previewInitials} size="lg" />
                <div className="min-w-0 flex-1">
                  <h2 id="employee-drawer-title" className="truncate text-xl font-semibold">{mode === "create" ? "Add employee" : `Edit ${previewName}`}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Enter the employee&apos;s personal and employment information.</p>
                </div>
                <Button type="button" variant="ghost" size="icon" aria-label="Close" onClick={onClose} disabled={saving}><X className="size-4" /></Button>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2">
                {["Personal", "Employment", "Review"].map((label, index) => (
                  <button key={label} type="button" onClick={() => goToStep(index)} className="group text-left">
                    <span className={cn("mb-2 block h-1 rounded-full transition-colors", index <= step ? "bg-primary" : "bg-muted")} />
                    <span className={cn("text-xs font-semibold", index === step ? "text-foreground" : "text-muted-foreground")}>{label}</span>
                  </button>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-2">
                {step > 0 && <Button type="button" variant="outline" size="lg" className="rounded-md" onClick={() => goToStep(step - 1)} disabled={saving}>Back</Button>}
                <Button type="button" size="lg" className="h-10 flex-1 rounded-md" disabled={saving} onClick={() => void handlePrimaryAction()}>
                  {saving ? "Saving employee…" : step < 2 ? <>Continue <ChevronRight className="size-4" /></> : mode === "create" ? <><Save className="size-4" />Save employee</> : <><Save className="size-4" />Save changes</>}
                </Button>
              </div>
            </div>

            <form onSubmit={submit} className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto px-6 py-6">
                  <div key={step} className="space-y-5">
                    {step === 0 && (
                      <>
                        <SectionIntro title="Personal information" detail="Name and contact details" />
                        {mode === "create" && <label className="block">{fieldLabel("Employee ID", true)}<Input autoFocus value={form.employee_id ?? ""} onChange={(event) => update("employee_id", event.target.value.toUpperCase())} placeholder="Generated automatically if blank" className={inputClass} /></label>}
                        <div className="grid gap-4 sm:grid-cols-2">
                          <label className="block">{fieldLabel("First name")}<Input autoFocus={mode === "edit"} required value={form.first_name} onChange={(event) => update("first_name", event.target.value)} placeholder="Jordan" className={inputClass} /></label>
                          <label className="block">{fieldLabel("Last name")}<Input required value={form.last_name} onChange={(event) => update("last_name", event.target.value)} placeholder="Lee" className={inputClass} /></label>
                        </div>
                        <label className="block">{fieldLabel("Preferred name", true)}<Input value={form.preferred_name ?? ""} onChange={(event) => update("preferred_name", event.target.value)} placeholder="Preferred first name" className={inputClass} /></label>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <label className="block">{fieldLabel("Work email", true)}<div className="relative"><Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input type="email" value={form.work_email ?? ""} onChange={(event) => update("work_email", event.target.value)} placeholder="jordan@company.com" className={cn(inputClass, "pl-9")} /></div></label>
                          <label className="block">{fieldLabel("Phone", true)}<Input type="tel" value={form.phone ?? ""} onChange={(event) => update("phone", event.target.value)} placeholder="+1 415 555 0123" className={inputClass} /></label>
                        </div>
                      </>
                    )}

                    {step === 1 && (
                      <>
                        <SectionIntro title="Employment details" detail="Role, department, location, and manager" />
                        <label className="block">{fieldLabel("Job title")}<Input autoFocus required value={form.job_title} onChange={(event) => update("job_title", event.target.value)} placeholder="People Operations Manager" className={inputClass} /></label>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <label className="block">{fieldLabel("Department")}<Input required list="people-departments" value={form.department} onChange={(event) => update("department", event.target.value)} placeholder="People" className={inputClass} /><datalist id="people-departments">{dimensions?.departments.map((item) => <option key={item} value={item} />)}</datalist></label>
                          <label className="block">{fieldLabel("Location")}<div className="relative"><MapPin className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input required list="people-locations" value={form.location} onChange={(event) => update("location", event.target.value)} placeholder="New York" className={cn(inputClass, "pl-9")} /></div><datalist id="people-locations">{dimensions?.locations.map((item) => <option key={item} value={item} />)}</datalist></label>
                        </div>
                        <label className="block">{fieldLabel("Manager", true)}<select value={form.manager_id ?? ""} onChange={(event) => update("manager_id", event.target.value)} className={selectClass}><option value="">No manager assigned</option>{managerOptions.map((manager) => <option key={manager.employee_id} value={manager.employee_id}>{manager.display_name} · {manager.job_title}</option>)}</select></label>
                      </>
                    )}

                    {step === 2 && (
                      <>
                        <SectionIntro title="Review" detail="Confirm status and employment details before saving" />
                        <label className="block">{fieldLabel("Hire date")}<Input autoFocus required type="date" value={form.hire_date} onChange={(event) => update("hire_date", event.target.value)} className={inputClass} /></label>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <label className="block">{fieldLabel("Employment type")}<select value={form.employment_type} onChange={(event) => update("employment_type", event.target.value)} className={selectClass}>{employmentTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
                          <label className="block">{fieldLabel("Status")}<select value={form.employment_status} onChange={(event) => update("employment_status", event.target.value)} className={selectClass}>{employmentStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
                        </div>
                        <div className="rounded-lg border border-primary/15 bg-primary/[0.04] p-4">
                          <div className="flex items-center gap-3">
                            <PersonAvatar employeeId={form.employee_id || previewName} initials={previewInitials} />
                            <div className="min-w-0"><p className="truncate text-sm font-semibold">{previewName}</p><p className="truncate text-xs text-muted-foreground">{form.job_title || "Role not set"} · {form.department || "Department not set"}</p></div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                {error && <p role="alert" aria-live="polite" className="mt-5 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">{error}</p>}
              </div>

            </form>
          </aside>
    </div>
  )
}

function SectionIntro({ title, detail }: { title: string; detail: string }) {
  return <div className="border-b border-border pb-3"><h3 className="font-semibold">{title}</h3><p className="mt-0.5 text-xs text-muted-foreground">{detail}</p></div>
}
