"use client"

import { useEffect } from "react"
import { CircleAlert, RotateCcw } from "lucide-react"

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-lg rounded-lg border border-border bg-card p-8 text-center shadow-none">
        <span className="mx-auto flex size-11 items-center justify-center rounded-md bg-amber-100 text-amber-700"><CircleAlert className="size-5" /></span>
        <h2 className="mt-5 text-2xl font-semibold tracking-[-0.02em]">Unable to load this page</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Your data was not changed. Try again. If the problem continues, check the connection status in Data Hub.</p>
        <button type="button" onClick={reset} className="mt-5 inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">
          <RotateCcw className="size-4" /> Try again
        </button>
      </div>
    </div>
  )
}
