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
        className="inline-flex h-11 w-full items-center justify-center rounded-[4px] border border-[#8c8c8c] bg-white px-4 text-[14px] font-semibold text-[#1f1f1f] transition-colors hover:bg-[#f5f5f5] disabled:cursor-not-allowed disabled:opacity-55"
      >
        {loading && <LoaderCircle className="mr-2 size-4 animate-spin" />}
        Continue with Microsoft
      </button>
      {!configured && <p role="status" className="mt-3 text-xs text-muted-foreground">Microsoft sign-in is not configured.</p>}
      {error && <p role="alert" className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{error}</p>}
    </div>
  )
}
