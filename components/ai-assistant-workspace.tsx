"use client"

import { useState } from "react"

import { AgentCopilot } from "@/components/agent-copilot"
import { AgentWorkflows } from "@/components/agent-workflows"
import { cn } from "@/lib/utils"

type View = "chat" | "calendar"

export function AiAssistantWorkspace({ dataMode, canPrepare }: { dataMode: string; canPrepare: boolean }) {
  const [view, setView] = useState<View>("chat")

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex min-h-12 items-end gap-1 border-b border-border px-3" role="tablist" aria-label="AI assistant tools">
        {[
          { id: "chat" as const, label: "Ask about workforce data" },
          { id: "calendar" as const, label: "Schedule a meeting" },
        ].map((item) => <button key={item.id} type="button" role="tab" aria-selected={view === item.id} onClick={() => setView(item.id)} className={cn("-mb-px h-12 border-b-2 px-3 font-semibold", view === item.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{item.label}</button>)}
      </div>

      {view === "chat" ? (
        <div className="flex h-[680px] min-h-0 flex-col bg-muted/15"><AgentCopilot dataMode={dataMode} /></div>
      ) : (
        <div className="p-4 sm:p-5"><AgentWorkflows canPrepare={canPrepare} /></div>
      )}
    </section>
  )
}
