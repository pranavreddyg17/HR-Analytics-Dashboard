"use client"

import { useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { LayoutGroup } from "motion/react"
import * as m from "motion/react-m"

import { AgentCopilot, type AssistantWorkflow } from "@/components/agent-copilot"
import { AgentWorkflows } from "@/components/agent-workflows"
import styles from "@/components/ai-surfaces.module.css"

type View = "conversation" | "actions"

const assistantViews: Array<{ id: View; label: string }> = [
  { id: "conversation", label: "Conversation" },
  { id: "actions", label: "Actions" },
]

export function AiAssistantWorkspace({ dataMode, canPrepare }: { dataMode: string; canPrepare: boolean }) {
  const searchParams = useSearchParams()
  const initialPrompt = searchParams.get("prompt")?.slice(0, 1_200) ?? ""
  const [actionPrompt, setActionPrompt] = useState(initialPrompt)
  const requestedView = searchParams.get("view")
  const initialView: View = requestedView === "conversation" ? "conversation" : ["actions", "workflows"].includes(requestedView ?? "") || initialPrompt ? "actions" : "conversation"
  const [view, setView] = useState<View>(initialView)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  function selectView(nextView: View) {
    setView(nextView)
    const next = new URLSearchParams(searchParams.toString())
    next.set("view", nextView)
    window.history.replaceState(window.history.state, "", `/assistant?${next.toString()}`)
  }

  function reviewWorkflow(workflow: AssistantWorkflow) {
    setActionPrompt(workflow.prompt)
    selectView("actions")
  }

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex = index
    if (event.key === "ArrowRight") nextIndex = (index + 1) % assistantViews.length
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + assistantViews.length) % assistantViews.length
    else if (event.key === "Home") nextIndex = 0
    else if (event.key === "End") nextIndex = assistantViews.length - 1
    else return
    event.preventDefault()
    selectView(assistantViews[nextIndex].id)
    window.requestAnimationFrame(() => tabRefs.current[nextIndex]?.focus())
  }

  return (
    <section className={styles.workspace}>
      <LayoutGroup id="assistant-view-switcher">
        <div className={styles.workspaceToolbar} role="tablist" aria-label="AI assistant tools">
          {assistantViews.map((item, index) => {
            const active = view === item.id
            return <button type="button" key={item.id} ref={(element) => { tabRefs.current[index] = element }} id={`assistant-tab-${item.id}`} role="tab" aria-selected={active} aria-controls={`assistant-panel-${item.id}`} tabIndex={active ? 0 : -1} onClick={() => selectView(item.id)} onKeyDown={(event) => handleTabKeyDown(event, index)} className={styles.workspaceTab}>
              {active && <m.span layoutId="assistant-active-view" className={styles.activeTab} aria-hidden="true" />}
              <span className="relative z-[1]">{item.label}</span>
            </button>
          })}
        </div>
      </LayoutGroup>

      {view === "conversation" ? (
        <m.div key="conversation" id="assistant-panel-conversation" role="tabpanel" aria-labelledby="assistant-tab-conversation" className={`${styles.workspacePanel} h-[min(720px,calc(100dvh-190px))]`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}><AgentCopilot dataMode={dataMode} onReviewWorkflow={reviewWorkflow} /></m.div>
      ) : (
        <m.div key="actions" id="assistant-panel-actions" role="tabpanel" aria-labelledby="assistant-tab-actions" className={styles.workspacePanel} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}><AgentWorkflows key={actionPrompt || "new-action"} canPrepare={canPrepare} initialPrompt={actionPrompt} /></m.div>
      )}
    </section>
  )
}
