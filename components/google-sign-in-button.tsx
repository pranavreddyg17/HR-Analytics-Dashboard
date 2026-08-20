"use client"

import { useEffect, useRef, useState } from "react"
import { LoaderCircle } from "lucide-react"
import { signIn } from "next-auth/react"

type GoogleCredentialResponse = { credential?: string }

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          disableAutoSelect?: () => void
          initialize: (options: Record<string, unknown>) => void
          renderButton: (element: HTMLElement, options: Record<string, unknown>) => void
        }
      }
    }
  }
}

export function GoogleSignInButton({ clientId }: { clientId: string }) {
  const container = useRef<HTMLDivElement>(null)
  const renderedWidth = useRef(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let active = true
    let scriptTimer: number | undefined

    async function handleCredential(response: GoogleCredentialResponse) {
      if (!response.credential) {
        setLoading(false)
        setError("Google did not return a sign-in credential.")
        return
      }
      setLoading(true)
      setError("")
      try {
        const result = await Promise.race([
          signIn("google-id-token", {
            credential: response.credential,
            redirect: false,
            redirectTo: "/",
          }),
          new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error("SIGN_IN_TIMEOUT")), 20_000)),
        ])
        if (!active) return
        if (!result?.ok || result.error) {
          setLoading(false)
          setError("This Google account is not approved for this workspace, or sign-in could not be verified.")
          return
        }
        // Authentication responses may contain an absolute URL derived from a
        // reverse proxy's internal bind address. Only follow a same-origin
        // destination; the requested post-login route is the workspace root.
        const destination = new URL(result.url ?? "/", window.location.origin)
        window.location.assign(destination.origin === window.location.origin
          ? `${destination.pathname}${destination.search}${destination.hash}`
          : "/")
      } catch {
        if (!active) return
        setLoading(false)
        setError("Sign-in could not be completed. Please retry.")
      }
    }

    function render() {
      if (!active || !container.current || !window.google || !clientId) return
      const width = Math.min(400, Math.max(220, Math.round(container.current.clientWidth || 400)))
      if (renderedWidth.current === width && container.current.childElementCount) return
      renderedWidth.current = width
      container.current.replaceChildren()
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleCredential,
        context: "signin",
        ux_mode: "popup",
        auto_select: false,
        cancel_on_tap_outside: false,
      })
      window.google.accounts.id.renderButton(container.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        logo_alignment: "left",
        width,
      })
      setLoading(false)
    }

    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => render())
    if (container.current) resizeObserver?.observe(container.current)

    if (!clientId) return () => { active = false }

    if (window.google) {
      render()
    } else {
      const script = document.createElement("script")
      script.src = "https://accounts.google.com/gsi/client"
      script.async = true
      script.defer = true
      script.onload = () => { if (scriptTimer) window.clearTimeout(scriptTimer); render() }
      script.onerror = () => { if (scriptTimer) window.clearTimeout(scriptTimer); if (active) { setLoading(false); setError("Google sign-in could not be loaded. Open this page in Chrome, Safari, or Edge and retry.") } }
      document.head.appendChild(script)
      scriptTimer = window.setTimeout(() => {
        if (active && !window.google) {
          setLoading(false)
          setError("Google sign-in could not be loaded. Please refresh and retry.")
        }
      }, 10_000)
    }

    return () => { active = false; resizeObserver?.disconnect(); if (scriptTimer) window.clearTimeout(scriptTimer) }
  }, [clientId])

  const displayedError = clientId ? error : "Google sign-in is temporarily unavailable."

  return (
    <div>
      <div className="relative h-11 w-full overflow-hidden">
        <div ref={container} className={`absolute inset-0 flex h-11 w-full items-center justify-center transition-opacity ${loading ? "opacity-0" : "opacity-100"}`} />
        {loading && clientId && <div className="absolute inset-0 flex h-11 items-center justify-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading Google sign-in</div>}
      </div>
      {displayedError && <p role="alert" className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{displayedError}</p>}
    </div>
  )
}
