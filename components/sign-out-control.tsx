"use client"

import type { ComponentProps } from "react"
import { useState } from "react"
import { signOut } from "next-auth/react"

import { cn } from "@/lib/utils"

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

type SignOutControlProps = Omit<ComponentProps<"button">, "children" | "disabled" | "onClick" | "type">

export function SignOutControl({ className, ...props }: SignOutControlProps) {
  const [busy, setBusy] = useState(false)

  async function leaveWorkspace() {
    if (busy) return
    setBusy(true)

    try {
      window.google?.accounts.id.disableAutoSelect?.()
      await signOut({ redirect: false, redirectTo: "/login?signedOut=1" })
    } finally {
      // A hard replacement prevents a protected page from remaining in the
      // browser's history after Auth.js has cleared the shared-domain cookie.
      window.location.replace("/login?signedOut=1")
    }
  }

  return (
    <button
      type="button"
      disabled={busy}
      aria-busy={busy}
      onClick={() => void leaveWorkspace()}
      className={cn("text-button disabled:cursor-wait disabled:opacity-60", className)}
      {...props}
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  )
}
