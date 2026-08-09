"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { X } from "lucide-react"

import { AgentCopilot } from "@/components/agent-copilot"
import { Button } from "@/components/ui/button"
import { resolveAssistantPageContext } from "@/lib/assistant-page-context"

export function ContextualAiAssistant({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  if (pathname === "/assistant") return null
  const context = resolveAssistantPageContext(pathname, Object.fromEntries(searchParams.entries()))
  const scope = Object.entries(context.filters).filter(([key]) => key !== "employeeId").map(([key, value]) => `${key}: ${value}`).join(" · ")
  return <>
    {!open && <Button type="button" className="fixed bottom-5 right-5 z-40 shadow-lg" onClick={() => onOpenChange(true)}>Ask AI</Button>}
    {open && <div className="fixed inset-0 z-[110] flex justify-end" role="dialog" aria-modal="true" aria-label="Contextual AI assistant">
      <button type="button" className="absolute inset-0 bg-foreground/20" aria-label="Close AI assistant" onClick={() => onOpenChange(false)}/>
      <section className="relative flex h-dvh w-full max-w-[520px] flex-col border-l border-border bg-background shadow-xl">
        <header className="flex min-h-14 items-center justify-between border-b border-border px-4 py-2"><div className="min-w-0"><p className="text-card-title">AI assistant</p><p className="truncate text-meta text-muted-foreground">{context.label}{scope ? ` · ${scope}` : ""}</p></div><Button type="button" size="icon" variant="ghost" aria-label="Close AI assistant" onClick={() => onOpenChange(false)}><X className="size-4"/></Button></header>
        <div className="min-h-0 flex-1"><AgentCopilot key={`${context.route}:${JSON.stringify(context.filters)}`} dataMode="all" pageContext={context} compact/></div>
      </section>
    </div>}
  </>
}
