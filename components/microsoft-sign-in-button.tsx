"use client"

import { useState } from "react"
import { LoaderCircle } from "lucide-react"
import { signIn } from "next-auth/react"

export function MicrosoftSignInButton({ configured }: { configured: boolean }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function continueWithMicrosoft() {
    if (!configured || loading) return
    setLoading(true)
    setError("")
    try {
      await signIn("microsoft-entra-id", { redirectTo: `${window.location.origin}/` })
    } catch {
      setLoading(false)
      setError("Microsoft sign-in could not be started. Please retry.")
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={continueWithMicrosoft}
        disabled={!configured || loading}
        aria-busy={loading}
        aria-label={loading ? "Connecting to Microsoft" : "Continue with Microsoft"}
        className="relative inline-flex h-11 w-full items-center justify-center overflow-hidden rounded-[4px] border border-[#8c8c8c] bg-white px-4 text-[14px] font-semibold text-[#1f1f1f] transition-colors hover:bg-[#f5f5f5] disabled:cursor-not-allowed disabled:opacity-55"
      >
        <span aria-hidden={loading} className={loading ? "opacity-0" : "opacity-100"}>Continue with Microsoft</span>
        {loading && <span className="absolute inset-0 flex items-center justify-center gap-2" aria-hidden="true"><LoaderCircle className="size-4 animate-spin" />Connecting to Microsoft</span>}
      </button>
      <span className="sr-only" aria-live="polite">{loading ? "Connecting to Microsoft" : ""}</span>
      {!configured && <p role="status" className="mt-3 text-xs text-muted-foreground">Microsoft sign-in is not configured.</p>}
      {error && <p role="alert" className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{error}</p>}
    </div>
  )
}
