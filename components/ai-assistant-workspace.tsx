"use client"

import { useState } from "react"
import { useSearchParams } from "next/navigation"

import { AgentCopilot, type AssistantWorkflow } from "@/components/agent-copilot"
import { AgentWorkflows } from "@/components/agent-workflows"
import { cn } from "@/lib/utils"

type View = "conversation" | "actions"

export function AiAssistantWorkspace({ dataMode, canPrepare }: { dataMode: string; canPrepare: boolean }) {
  const searchParams = useSearchParams()
  const initialPrompt = searchParams.get("prompt")?.slice(0, 1_200) ?? ""
  const [actionPrompt, setActionPrompt] = useState(initialPrompt)
  const [view, setView] = useState<View>(() => ["actions", "workflows"].includes(searchParams.get("view") ?? "") || initialPrompt ? "actions" : "conversation")

  function reviewWorkflow(workflow: AssistantWorkflow) {
    setActionPrompt(workflow.prompt)
    setView("actions")
  }

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex min-h-12 items-end gap-1 border-b border-border px-3" role="tablist" aria-label="AI assistant tools">
        {[
          { id: "conversation" as const, label: "Conversation" },
          { id: "actions" as const, label: "Actions" },
        ].map((item) => <button key={item.id} type="button" role="tab" aria-selected={view === item.id} onClick={() => setView(item.id)} className={cn("-mb-px h-12 border-b-2 px-3 font-semibold", view === item.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>{item.label}</button>)}
      </div>

      {view === "conversation" ? (
        <div className="flex h-[680px] min-h-0 flex-col bg-muted/15"><AgentCopilot dataMode={dataMode} onReviewWorkflow={reviewWorkflow} /></div>
      ) : (
        <div className="p-4 sm:p-5"><AgentWorkflows key={actionPrompt || "new-action"} canPrepare={canPrepare} initialPrompt={actionPrompt} /></div>
      )}
    </section>
  )
}
