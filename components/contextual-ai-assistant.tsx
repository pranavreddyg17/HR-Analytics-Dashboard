"use client"

import { useEffect, useRef } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { X } from "lucide-react"
import { AnimatePresence } from "motion/react"
import * as m from "motion/react-m"

import { AgentCopilot } from "@/components/agent-copilot"
import { resolveAssistantPageContext } from "@/lib/assistant-page-context"

export function ContextualAiAssistant({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const panelRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open || pathname === "/assistant") return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 0)
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onOpenChange(false)
        return
      }
      if (event.key !== "Tab" || !panelRef.current) return
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.body.style.overflow = previousOverflow
      document.removeEventListener("keydown", handleKeyDown)
      previous?.focus()
    }
  }, [onOpenChange, open, pathname])

  if (pathname === "/assistant") return null
  const context = resolveAssistantPageContext(pathname, Object.fromEntries(searchParams.entries()))
  const scope = Object.entries(context.filters).filter(([key]) => key !== "employeeId").map(([key, value]) => `${key}: ${value}`).join(" · ")
  return <AnimatePresence mode="wait" initial={false}>
    {!open ? <m.button key="launcher" type="button" className="assistant-launcher" onClick={() => onOpenChange(true)} aria-label={`Ask AI about ${context.label}`} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}><span>Ask AI</span></m.button>
    : <m.div key="drawer" className="assistant-drawer-layer" role="dialog" aria-modal="true" aria-label="Contextual AI assistant" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <m.button type="button" className="assistant-drawer-backdrop" aria-label="Close AI assistant" onClick={() => onOpenChange(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}/>
      <m.section ref={panelRef} className="assistant-drawer-panel" initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.18 }}>
        <header className="assistant-drawer-header"><div className="min-w-0"><p className="text-card-title">Assistant</p><p className="truncate text-meta text-muted-foreground">{context.label}{scope ? ` · ${scope}` : ""}</p></div><button ref={closeButtonRef} type="button" className="assistant-drawer-close" aria-label="Close AI assistant" onClick={() => onOpenChange(false)}><X className="size-4"/></button></header>
        <div className="min-h-0 flex-1"><AgentCopilot key={`${context.route}:${JSON.stringify(context.filters)}`} dataMode="all" pageContext={context} compact/></div>
      </m.section>
    </m.div>}
  </AnimatePresence>
}
