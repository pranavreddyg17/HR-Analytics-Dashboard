"use client"

import { useEffect } from "react"

export function SessionRevalidator({ enabled = true }: { enabled?: boolean }) {
  useEffect(() => {
    if (!enabled) return
    let checking = false

    async function verifySession() {
      if (checking) return
      checking = true
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" })
        const session = response.ok ? await response.json() as { user?: { email?: string } } : null
        if (!session?.user?.email) window.location.replace("/login?signedOut=1")
      } catch {
        // A temporary network failure should not discard an active workspace.
      } finally {
        checking = false
      }
    }

    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) void verifySession()
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") void verifySession()
    }

    window.addEventListener("pageshow", onPageShow)
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      window.removeEventListener("pageshow", onPageShow)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [enabled])

  return null
}
