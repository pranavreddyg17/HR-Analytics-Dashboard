"use client"

import { useState } from "react"
import { useSearchParams } from "next/navigation"

import { AgentCopilot, type AssistantWorkflow } from "@/components/agent-copilot"
import { AgentWorkflows } from "@/components/agent-workflows"

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
    <section className="assistant-workspace">
      <div className="assistant-workspace__toolbar" role="tablist" aria-label="AI assistant tools">
        {[
          { id: "conversation" as const, label: "Conversation" },
          { id: "actions" as const, label: "Actions" },
        ].map((item) => <button key={item.id} type="button" role="tab" aria-selected={view === item.id} onClick={() => setView(item.id)} className="assistant-workspace__tab">{item.label}</button>)}
      </div>

      {view === "conversation" ? (
        <div className="flex h-[min(720px,calc(100dvh-190px))] min-h-[560px] flex-col bg-muted/15"><AgentCopilot dataMode={dataMode} onReviewWorkflow={reviewWorkflow} /></div>
      ) : (
        <div className="p-4 sm:p-5"><AgentWorkflows key={actionPrompt || "new-action"} canPrepare={canPrepare} initialPrompt={actionPrompt} /></div>
      )}
    </section>
  )
}
