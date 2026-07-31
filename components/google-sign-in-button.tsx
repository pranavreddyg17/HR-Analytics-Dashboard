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
          initialize: (options: Record<string, unknown>) => void
          renderButton: (element: HTMLElement, options: Record<string, unknown>) => void
        }
      }
    }
  }
}

export function GoogleSignInButton({ clientId }: { clientId: string }) {
  const container = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    let active = true

    async function handleCredential(response: GoogleCredentialResponse) {
      if (!response.credential) {
        setError("Google did not return a sign-in credential.")
        return
      }
      setLoading(true)
      setError("")
      const result = await signIn("google-id-token", {
        credential: response.credential,
        redirect: false,
        redirectTo: "/",
      })
      if (!active) return
      if (!result?.ok || result.error) {
        setLoading(false)
        setError("This Google account is not approved for this workspace, or sign-in could not be verified.")
        return
      }
      window.location.assign(result.url ?? "/")
    }

    function render() {
      if (!active || !container.current || !window.google || !clientId) return
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
        width: Math.min(400, container.current.clientWidth || 400),
      })
      setLoading(false)
    }

    if (window.google) {
      render()
    } else {
      const script = document.createElement("script")
      script.src = "https://accounts.google.com/gsi/client"
      script.async = true
      script.defer = true
      script.onload = render
      script.onerror = () => { if (active) { setLoading(false); setError("Google sign-in could not be loaded. Open this page in Chrome, Safari, or Edge and retry.") } }
      document.head.appendChild(script)
    }

    return () => { active = false }
  }, [clientId])

  return (
    <div>
      <div ref={container} className="flex min-h-11 w-full items-center justify-center" />
      {loading && <div className="flex h-11 items-center justify-center gap-2 text-sm text-[#637083]"><LoaderCircle className="size-4 animate-spin" />Loading Google sign-in</div>}
      {error && <p role="alert" className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">{error}</p>}
    </div>
  )
}
