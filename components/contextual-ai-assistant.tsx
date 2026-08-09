"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { X } from "lucide-react"

import { AgentCopilot } from "@/components/agent-copilot"
import { Button } from "@/components/ui/button"

const pageContext: Record<string, string> = {
  "/": "Home priorities",
  "/people": "People directory",
  "/inbox": "Inbox and approvals",
  "/hiring": "Hiring operations",
  "/leaves": "Leave operations",
  "/courses": "Learning assignments",
  "/insights": "Workforce insights",
  "/attrition": "Attrition risk review",
  "/imports": "Data imports and exports",
  "/access": "Access administration",
}

export function ContextualAiAssistant({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  if (pathname === "/assistant") return null
  const baseContext = pathname.startsWith("/people/")
    ? `Employee profile ${decodeURIComponent(pathname.split("/").at(-1) ?? "")}`
    : pageContext[pathname] ?? "HR workspace"
  const activeScope = ["department", "location", "view", "item"]
    .flatMap((key) => searchParams.get(key) ? [`${key}: ${searchParams.get(key)}`] : [])
    .join(", ")
  const context = activeScope ? `${baseContext} (${activeScope})`.slice(0, 180) : baseContext
  return <>
    {!open && <Button type="button" className="fixed bottom-5 right-5 z-40 shadow-lg" onClick={() => onOpenChange(true)}>Ask AI</Button>}
    {open && <div className="fixed inset-0 z-[110] flex justify-end" role="dialog" aria-modal="true" aria-label="Contextual AI assistant">
      <button type="button" className="absolute inset-0 bg-foreground/20" aria-label="Close AI assistant" onClick={() => onOpenChange(false)}/>
      <section className="relative flex h-dvh w-full max-w-[520px] flex-col border-l border-border bg-background shadow-xl">
        <header className="flex h-14 items-center justify-between border-b border-border px-4"><div><p className="text-card-title">AI assistant</p><p className="text-meta text-muted-foreground">{context}</p></div><Button type="button" size="icon" variant="ghost" aria-label="Close AI assistant" onClick={() => onOpenChange(false)}><X className="size-4"/></Button></header>
        <div className="min-h-0 flex-1"><AgentCopilot dataMode="all" pageContext={context} compact/></div>
      </section>
    </div>}
  </>
}
