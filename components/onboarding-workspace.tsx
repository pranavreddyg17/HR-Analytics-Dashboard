"use client"

import Link from "next/link"
import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { RegisterPagination } from "@/components/register-pagination"
import { MetricStrip, WorkspaceHeader, WorkspacePage } from "@/components/workspace-ui"
import type { OnboardingOperations } from "@/lib/onboarding-types"

function dateLabel(value: string | null): string {
  if (!value) return "Not scheduled"
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`)
  return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(parsed) : value
}

export function OnboardingWorkspace({ initialData, canRequestHiring, initialError = "" }: { initialData: OnboardingOperations; canRequestHiring: boolean; initialError?: string }) {
  const [data, setData] = useState(initialData)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(initialError)

  async function refresh() {
    setLoading(true); setError("")
    try {
      const response = await fetch("/api/v1/hr/onboarding", { cache: "no-store" })
      const body = await response.json() as OnboardingOperations & { error?: string }
      if (!response.ok) throw new Error(body.error || "Onboarding operations could not be loaded.")
      setData(body)
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Onboarding operations could not be loaded.") }
    finally { setLoading(false) }
  }

  return <WorkspacePage>
    <WorkspaceHeader title="Onboarding" description="New-joiner verification and start readiness." actions={<><Button variant="outline" onClick={() => void refresh()} disabled={loading}>{loading ? "Refreshing" : "Refresh"}</Button>{canRequestHiring && <Button nativeButton={false} render={<Link href="/inbox?new=hiring&returnTo=%2Fonboarding" />}>Request position</Button>}</>}/>
    <div className="flex border-b border-border" role="tablist" aria-label="Onboarding stages">
      <Link href="/onboarding" aria-current="page" className="-mb-px border-b-2 border-primary px-4 py-2.5 font-semibold">New joiners</Link>
      <Link href="/onboarding?view=talent" className="-mb-px border-b-2 border-transparent px-4 py-2.5 font-semibold text-muted-foreground hover:text-foreground">Talent acquisition</Link>
    </div>
    {error && <p role="alert" className="rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3 text-meta text-destructive">{error}</p>}
    <MetricStrip metrics={[
      { label: "Preboarding", value: data.summary.preboarding, detail: "Employee profiles" },
      { label: "Awaiting verification", value: data.summary.awaitingVerification, detail: "People team decision" },
      { label: "Starting in 30 days", value: data.summary.startingNext30Days, detail: "Upcoming starts" },
      { label: "Manager missing", value: data.summary.missingManager, detail: "Reporting line incomplete" },
    ]}/>
    <Card className="gap-0 overflow-hidden py-0 shadow-none">
      <CardHeader className="border-b border-border px-5 py-4"><CardTitle>New-joiner register</CardTitle><CardDescription>Preboarding profiles and the next recorded action.</CardDescription></CardHeader>
      <CardContent className="p-0"><RegisterPagination rows={data.joiners} itemLabel="joiners" resetKey={data.generatedAt}>{(pageRows) => <><div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left text-body"><thead className="bg-muted/40 text-label font-semibold text-muted-foreground"><tr>{["Employee", "Role", "Start date", "Readiness", "Next action", ""].map((heading) => <th key={heading} className="px-4 py-2.5">{heading}</th>)}</tr></thead><tbody>{pageRows.map((joiner) => <tr key={joiner.employeeId} className="border-t border-border/70 hover:bg-muted/20"><td className="px-4 py-3"><p className="font-semibold">{joiner.name}</p><p className="text-meta text-muted-foreground">{joiner.workEmail || joiner.employeeId}</p></td><td className="px-4 py-3"><p>{joiner.jobTitle}</p><p className="text-meta text-muted-foreground">{joiner.department} · {joiner.location}</p></td><td className="px-4 py-3 tabular-nums">{dateLabel(joiner.startDate)}</td><td className="px-4 py-3"><Badge variant={joiner.verificationStatus === "Verification" ? "destructive" : joiner.verificationStatus === "Ready" ? "outline" : "secondary"}>{joiner.verificationStatus}</Badge><p className="mt-1 text-meta text-muted-foreground">{joiner.managerId ? joiner.manager : "Manager not assigned"}</p></td><td className="max-w-sm px-4 py-3 text-muted-foreground">{joiner.nextAction}{joiner.dueDate ? <span className="mt-1 block text-meta">Due {dateLabel(joiner.dueDate)}</span> : null}</td><td className="px-4 py-3 text-right"><Button nativeButton={false} size="xs" variant="outline" render={<Link href={joiner.reviewHref} />}>Review</Button></td></tr>)}</tbody></table></div>{!pageRows.length && <p className="p-10 text-center text-body text-muted-foreground">No employees are currently in preboarding.</p>}</>}</RegisterPagination></CardContent>
    </Card>
  </WorkspacePage>
}
