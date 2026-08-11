"use client"

import Link from "next/link"
import { useState } from "react"

import { SignOutControl } from "@/components/sign-out-control"
import { SessionRevalidator } from "@/components/session-revalidator"
import { Button } from "@/components/ui/button"
import type { EmployeeOnboardingState } from "@/lib/server/employee-onboarding"

const inputClass = "mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-control outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"

function saved(submission: Record<string, unknown> | null, key: string, fallback = ""): string {
  const value = submission?.[key]
  return value === null || value === undefined ? fallback : String(value)
}

export function EmployeeOnboarding({ user, onboarding }: { user: { name: string; email: string; authenticated: boolean; workspaceAccess: boolean }; onboarding: EmployeeOnboardingState }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true); setError("")
    try {
      const response = await fetch("/api/v1/employee/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organizationName: form.get("organizationName"), firstName: form.get("firstName"), lastName: form.get("lastName"),
          preferredName: form.get("preferredName"), phone: form.get("phone"), department: form.get("department"),
          jobTitle: form.get("jobTitle"), jobLevel: form.get("jobLevel"), location: form.get("location"),
          managerName: form.get("managerName"), managerEmail: form.get("managerEmail"), hireDate: form.get("hireDate"),
          employmentType: form.get("employmentType"), annualSalary: Number(form.get("annualSalary")), currency: form.get("currency"),
        }),
      })
      const body = await response.json() as { error?: string }
      if (!response.ok) throw new Error(body.error || "Profile could not be saved.")
      window.location.reload()
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Profile could not be saved.") }
    finally { setBusy(false) }
  }

  return <main className="employee-shell min-h-screen text-foreground">
    <SessionRevalidator enabled={user.authenticated} />
    <header className="employee-shell__header">
      <div className="mx-auto flex min-h-14 max-w-3xl items-center justify-end gap-3 px-4 sm:px-6"><div className="flex items-center gap-3">{user.workspaceAccess && <Link href="/" className="employee-shell__sign-out">HR workspace</Link>}<SignOutControl className="employee-shell__sign-out" /></div></div>
    </header>
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      {onboarding.status === "submitted" ? <section className="surface-card p-6">
        <h1 className="text-page-title">Profile awaiting verification</h1>
        <p className="mt-2 text-page-description text-muted-foreground">People Operations is reviewing your role, reporting line, and employment details. Employee services will open after approval.</p>
        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
          <div><dt className="text-label text-muted-foreground">Role</dt><dd className="mt-1 text-body">{saved(onboarding.submission, "job_title")}</dd></div>
          <div><dt className="text-label text-muted-foreground">Department</dt><dd className="mt-1 text-body">{saved(onboarding.submission, "department")}</dd></div>
          <div><dt className="text-label text-muted-foreground">Location</dt><dd className="mt-1 text-body">{saved(onboarding.submission, "location")}</dd></div>
          <div><dt className="text-label text-muted-foreground">Manager</dt><dd className="mt-1 text-body">{saved(onboarding.submission, "manager_name", "Not provided")}</dd></div>
        </dl>
      </section> :
      <section className="surface-card overflow-hidden">
        <div className="border-b border-border px-5 py-4"><h1 className="text-page-title">{onboarding.status === "rejected" ? "Correct your employee profile" : "Set up your employee profile"}</h1><p className="mt-1 text-page-description text-muted-foreground">Signed in as {user.email}. Enter the employment details People Operations will verify.</p>{onboarding.status === "rejected" && <p className="mt-3 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-body text-destructive">{saved(onboarding.submission, "review_note", "People Operations returned this profile for correction.")}</p>}</div>
        <form onSubmit={submit} className="grid gap-4 p-5 sm:grid-cols-2">
          <label className="text-label sm:col-span-2">Organization<input required name="organizationName" defaultValue={saved(onboarding.submission, "organization_name", "LaidbackHR")} className={inputClass}/></label>
          <label className="text-label">First name<input required name="firstName" defaultValue={saved(onboarding.submission, "first_name", user.name.split(" ")[0] ?? "")} className={inputClass}/></label>
          <label className="text-label">Last name<input required name="lastName" defaultValue={saved(onboarding.submission, "last_name", user.name.split(" ").slice(1).join(" "))} className={inputClass}/></label>
          <label className="text-label">Preferred name<input name="preferredName" defaultValue={saved(onboarding.submission, "preferred_name")} className={inputClass}/></label>
          <label className="text-label">Phone<input name="phone" type="tel" defaultValue={saved(onboarding.submission, "phone")} className={inputClass}/></label>
          <label className="text-label">Department<input required name="department" defaultValue={saved(onboarding.submission, "department")} className={inputClass}/></label>
          <label className="text-label">Job title<input required name="jobTitle" defaultValue={saved(onboarding.submission, "job_title")} className={inputClass}/></label>
          <label className="text-label">Job level<select required name="jobLevel" defaultValue={saved(onboarding.submission, "job_level")} className={inputClass}><option value="" disabled>Select level</option><option>IC1</option><option>IC2</option><option>IC3</option><option>IC4</option><option>IC5</option><option>Manager</option><option>Director</option><option>Executive</option></select></label>
          <label className="text-label">Location<input required name="location" defaultValue={saved(onboarding.submission, "location")} className={inputClass}/></label>
          <label className="text-label">Manager name<input name="managerName" defaultValue={saved(onboarding.submission, "manager_name")} className={inputClass}/></label>
          <label className="text-label">Manager email<input name="managerEmail" type="email" defaultValue={saved(onboarding.submission, "manager_email")} className={inputClass}/></label>
          <label className="text-label">Hire date<input required name="hireDate" type="date" defaultValue={saved(onboarding.submission, "hire_date")} className={inputClass}/></label>
          <label className="text-label">Employment type<select required name="employmentType" defaultValue={saved(onboarding.submission, "employment_type", "Full-time")} className={inputClass}><option>Full-time</option><option>Part-time</option><option>Contract</option><option>Intern</option></select></label>
          <label className="text-label">Annual salary<input required name="annualSalary" type="number" min="0" step="100" defaultValue={saved(onboarding.submission, "requested_annual_salary")} className={inputClass}/></label>
          <label className="text-label">Currency<input required name="currency" defaultValue={saved(onboarding.submission, "salary_currency", "USD")} maxLength={3} className={inputClass}/></label>
          {error && <p role="alert" className="text-body text-destructive sm:col-span-2">{error}</p>}
          <div className="flex justify-end border-t border-border pt-4 sm:col-span-2"><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save profile"}</Button></div>
        </form>
      </section>
      }
    </div>
  </main>
}
