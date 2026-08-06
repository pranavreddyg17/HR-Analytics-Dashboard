"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import type { WorkforceAnalytics } from "@/lib/hr-types"

type InsightAction = WorkforceAnalytics["decisionSupport"]["actions"][number]
type ReportingFilters = {
  from: string
  to: string
  department: string
  location: string
  period: "month" | "quarter" | "year"
  recruitingCostPerHire?: number
  vacancyProductivityPercent?: number
  onboardingDays?: number
  onboardingProductivityPercent?: number
  courseFeePerLearner?: number
  courseHoursPerLearner?: number
}

export function InsightActionButton({
  action,
  filters,
  onUpdated,
}: {
  action: InsightAction
  filters: ReportingFilters
  onUpdated: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const workItem = action.workItem

  async function createWorkItem() {
    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      const response = await fetch("/api/v1/insights/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signalId: action.id, filters }),
      })
      const body = await response.json() as { error?: string }
      if (!response.ok) throw new Error(body.error || "Unable to create the work item.")
      setNotice(workItem?.status === "completed" ? "Follow-up created." : "Work item created.")
      onUpdated()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create the work item.")
    } finally {
      setLoading(false)
    }
  }

  async function updateWorkItem() {
    if (!workItem || note.trim().length < 10) {
      setError("Add a short work note.")
      return
    }
    const nextAction = workItem.status === "pending" ? "start" : "complete"
    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      const response = await fetch(`/api/v1/insights/actions/${encodeURIComponent(workItem.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: nextAction, note }),
      })
      const body = await response.json() as { error?: string }
      if (!response.ok) throw new Error(body.error || "Unable to update the work item.")
      setDialogOpen(false)
      setNote("")
      setNotice(nextAction === "start" ? "Work started." : "Work item completed.")
      onUpdated()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update the work item.")
    } finally {
      setLoading(false)
    }
  }

  const buttonLabel = !workItem ? "Create work item"
    : workItem.status === "pending" ? "Start work"
      : workItem.status === "in_progress" ? "Complete"
        : "Create follow-up"

  return (
    <>
      <div className="flex min-w-[132px] flex-col items-start gap-1">
        <Button
          size="sm"
          variant={workItem?.status === "in_progress" ? "default" : "outline"}
          disabled={loading}
          onClick={() => workItem && workItem.status !== "completed" ? setDialogOpen(true) : void createWorkItem()}
        >
          {loading ? "Saving…" : buttonLabel}
        </Button>
        {workItem && <span className="text-status text-muted-foreground">{workItem.status === "in_progress" ? "In progress" : workItem.status === "completed" ? "Completed" : "Pending"}{workItem.dueAt && workItem.status !== "completed" ? ` · due ${workItem.dueAt}` : ""}</span>}
        {notice && <span className="text-meta text-emerald-700 dark:text-emerald-300">{notice}</span>}
        {error && !dialogOpen && <span className="text-meta text-destructive">{error}</span>}
      </div>

      {dialogOpen && workItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialogOpen(false) }}>
          <section className="w-full max-w-lg rounded-lg border border-border bg-card shadow-xl" role="dialog" aria-modal="true" aria-labelledby="insight-work-item-title">
            <header className="border-b border-border px-5 py-4">
              <h2 id="insight-work-item-title" className="text-subsection font-semibold">{workItem.status === "pending" ? "Start" : "Complete"} work item</h2>
              <p className="mt-1 text-meta text-muted-foreground">{action.department} · {action.title}</p>
            </header>
            <div className="space-y-4 px-5 py-4">
              <div className="rounded-md border border-border bg-muted/25 px-3 py-2 text-meta">
                <p className="font-semibold">Evidence</p>
                <p className="mt-0.5 text-muted-foreground">{action.evidence}</p>
              </div>
              <label className="flex flex-col gap-1.5 text-label font-semibold text-muted-foreground">
                {workItem.status === "pending" ? "Work plan" : "Outcome and follow-up"}
                <textarea
                  autoFocus
                  rows={5}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder={workItem.status === "pending" ? "Record the evidence to validate, owner responsibilities, and next step." : "Record the completed work, outcome, and any required follow-up."}
                  className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-control font-normal text-foreground outline-none focus:ring-2 focus:ring-ring/40"
                />
              </label>
              {error && <p className="text-meta text-destructive">{error}</p>}
            </div>
            <footer className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <Button variant="outline" disabled={loading} onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button disabled={loading || note.trim().length < 10} onClick={updateWorkItem}>{loading ? "Saving…" : workItem.status === "pending" ? "Start work" : "Complete work item"}</Button>
            </footer>
          </section>
        </div>
      )}
    </>
  )
}
