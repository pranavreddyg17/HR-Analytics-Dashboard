"use client"

import { SignOutControl } from "@/components/sign-out-control"

export function EmployeeAccessEnded({
  user,
  employmentStatus,
}: {
  user: { name: string; email: string }
  employmentStatus: string
}) {
  return (
    <main className="employee-shell flex min-h-screen items-center justify-center px-4 py-10 text-foreground">
      <section className="w-full max-w-lg rounded-lg border border-border bg-background p-6 shadow-sm sm:p-8" aria-labelledby="employment-ended-title">
        <p className="text-card-title">LaidbackHR.ai</p>
        <h1 id="employment-ended-title" className="mt-6 text-page-title">Employee access ended</h1>
        <p className="mt-3 text-body text-muted-foreground">
          Your employee record is marked {employmentStatus}. Employee self-service is no longer available for this account.
        </p>
        <dl className="mt-6 border-y border-border py-4">
          <div><dt className="text-label text-muted-foreground">Signed in as</dt><dd className="mt-1 text-body">{user.name} · {user.email}</dd></div>
        </dl>
        <p className="mt-5 text-meta text-muted-foreground">If this status is incorrect, contact your People Operations administrator.</p>
        <SignOutControl className="mt-6 inline-flex h-9 items-center rounded-md bg-primary px-4 text-primary-foreground hover:bg-primary/90" />
      </section>
    </main>
  )
}
