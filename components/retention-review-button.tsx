"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

import { Button } from "@/components/ui/button"

export function RetentionReviewButton({
  department,
  reviewId,
  reviewStatus,
}: {
  department: string
  reviewId: string | null
  reviewStatus: "none" | "pending" | "in_progress" | "completed"
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const active = Boolean(reviewId && ["pending", "in_progress"].includes(reviewStatus))

  async function createReview() {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/v1/retention/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ department }),
      })
      const body = await response.json() as { error?: string }
      if (!response.ok) throw new Error(body.error || "Unable to create review.")
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create review.")
    } finally {
      setLoading(false)
    }
  }

  async function updateReview() {
    if (!reviewId || note.trim().length < 10) {
      setError("Add a short review note.")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/v1/retention/reviews/${encodeURIComponent(reviewId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: reviewStatus === "pending" ? "start" : "complete", note }),
      })
      const body = await response.json() as { error?: string }
      if (!response.ok) throw new Error(body.error || "Unable to update review.")
      setDialogOpen(false)
      setNote("")
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update review.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="flex flex-col items-start gap-1.5">
        {active ? (
          <Button size="sm" variant="outline" disabled={loading} onClick={() => { setError(null); setDialogOpen(true) }}>
            {reviewStatus === "pending" ? "Open review" : "Complete review"}
          </Button>
        ) : (
          <Button size="sm" disabled={loading} onClick={createReview}>
            {loading ? "Creating…" : reviewStatus === "completed" ? "New review" : "Create review"}
          </Button>
        )}
        {error && !dialogOpen && <span className="text-meta text-destructive">{error}</span>}
      </div>

      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialogOpen(false) }}>
          <section className="w-full max-w-lg rounded-lg border border-border bg-card shadow-xl" role="dialog" aria-modal="true" aria-labelledby="retention-review-title">
            <header className="border-b border-border px-5 py-4">
              <h2 id="retention-review-title" className="text-subsection font-semibold">
                {reviewStatus === "pending" ? "Start" : "Complete"} {department} review
              </h2>
            </header>
            <div className="space-y-4 px-5 py-4">
              <label className="flex flex-col gap-1.5 text-label font-semibold text-muted-foreground">
                {reviewStatus === "pending" ? "Review plan" : "Outcome and follow-up"}
                <textarea
                  autoFocus
                  rows={5}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder={reviewStatus === "pending" ? "Record the evidence to validate and the accountable next step." : "Record the outcome, completed action, and any follow-up."}
                  className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-control font-normal text-foreground outline-none focus:ring-2 focus:ring-ring/40"
                />
              </label>
              {error && <p className="text-meta text-destructive">{error}</p>}
            </div>
            <footer className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <Button variant="outline" disabled={loading} onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button disabled={loading || note.trim().length < 10} onClick={updateReview}>
                {loading ? "Saving…" : reviewStatus === "pending" ? "Start review" : "Complete review"}
              </Button>
            </footer>
          </section>
        </div>
      )}
    </>
  )
}
