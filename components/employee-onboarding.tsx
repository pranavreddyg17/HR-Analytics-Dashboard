"use client"

import { useState } from "react"
import { signOut } from "next-auth/react"

import { BrandLogo } from "@/components/brand-logo"
import { Button } from "@/components/ui/button"

const inputClass = "mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-control outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"

export function EmployeeOnboarding({ user }: { user: { name: string; email: string } }) {
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

  return <main className="min-h-screen bg-[#f5f6f8] px-4 py-8 text-foreground sm:px-6">
    <div className="mx-auto max-w-3xl">
      <header className="mb-5 flex items-center justify-between"><BrandLogo/><button className="text-button" onClick={() => signOut({ callbackUrl: "/login" })}>Sign out</button></header>
      <section className="surface-card overflow-hidden">
        <div className="border-b border-border px-5 py-4"><h1 className="text-page-title">Set up your employee profile</h1><p className="mt-1 text-page-description text-muted-foreground">Signed in as {user.email}. Enter the employment details People Operations will verify.</p></div>
        <form onSubmit={submit} className="grid gap-4 p-5 sm:grid-cols-2">
          <label className="text-label sm:col-span-2">Organization<input required name="organizationName" className={inputClass}/></label>
          <label className="text-label">First name<input required name="firstName" defaultValue={user.name.split(" ")[0] ?? ""} className={inputClass}/></label>
          <label className="text-label">Last name<input required name="lastName" defaultValue={user.name.split(" ").slice(1).join(" ")} className={inputClass}/></label>
          <label className="text-label">Preferred name<input name="preferredName" className={inputClass}/></label>
          <label className="text-label">Phone<input name="phone" type="tel" className={inputClass}/></label>
          <label className="text-label">Department<input required name="department" className={inputClass}/></label>
          <label className="text-label">Job title<input required name="jobTitle" className={inputClass}/></label>
          <label className="text-label">Job level<select required name="jobLevel" defaultValue="" className={inputClass}><option value="" disabled>Select level</option><option>IC1</option><option>IC2</option><option>IC3</option><option>IC4</option><option>IC5</option><option>Manager</option><option>Director</option><option>Executive</option></select></label>
          <label className="text-label">Location<input required name="location" className={inputClass}/></label>
          <label className="text-label">Manager name<input name="managerName" className={inputClass}/></label>
          <label className="text-label">Manager email<input name="managerEmail" type="email" className={inputClass}/></label>
          <label className="text-label">Hire date<input required name="hireDate" type="date" className={inputClass}/></label>
          <label className="text-label">Employment type<select required name="employmentType" defaultValue="Full-time" className={inputClass}><option>Full-time</option><option>Part-time</option><option>Contract</option><option>Intern</option></select></label>
          <label className="text-label">Annual salary<input required name="annualSalary" type="number" min="0" step="100" className={inputClass}/></label>
          <label className="text-label">Currency<input required name="currency" defaultValue="USD" maxLength={3} className={inputClass}/></label>
          {error && <p role="alert" className="text-body text-destructive sm:col-span-2">{error}</p>}
          <div className="flex justify-end border-t border-border pt-4 sm:col-span-2"><Button disabled={busy}>{busy ? "Saving…" : "Save profile"}</Button></div>
        </form>
      </section>
    </div>
  </main>
}
