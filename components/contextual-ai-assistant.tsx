"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { X } from "lucide-react"

import { AgentCopilot } from "@/components/agent-copilot"
import { resolveAssistantPageContext } from "@/lib/assistant-page-context"

export function ContextualAiAssistant({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  if (pathname === "/assistant") return null
  const context = resolveAssistantPageContext(pathname, Object.fromEntries(searchParams.entries()))
  const scope = Object.entries(context.filters).filter(([key]) => key !== "employeeId").map(([key, value]) => `${key}: ${value}`).join(" · ")
  return open ? <div className="assistant-drawer-layer" role="dialog" aria-modal="true" aria-label="Contextual AI assistant">
      <button type="button" className="assistant-drawer-backdrop" aria-label="Close AI assistant" onClick={() => onOpenChange(false)}/>
      <section className="assistant-drawer-panel">
        <header className="assistant-drawer-header"><div className="min-w-0"><p className="text-card-title">Assistant</p><p className="truncate text-meta text-muted-foreground">{context.label}{scope ? ` · ${scope}` : ""}</p></div><button type="button" className="assistant-drawer-close" aria-label="Close AI assistant" onClick={() => onOpenChange(false)}><X className="size-4"/></button></header>
        <div className="min-h-0 flex-1"><AgentCopilot key={`${context.route}:${JSON.stringify(context.filters)}`} dataMode="all" pageContext={context} compact/></div>
      </section>
    </div> : null
}
