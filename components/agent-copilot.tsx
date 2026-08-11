"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowUp, LoaderCircle } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { assistantPagePrompts, type AssistantPageContext } from "@/lib/assistant-page-context"
import { cn } from "@/lib/utils"

type ChatMessage = {
  id?: string
  role: "user" | "assistant"
  content: string
  tools?: Array<{ tool: string; status: string }>
  context?: Array<{ source: string; section: string }>
  dataMode?: string
  workflow?: {
    prompt: string
    type: "calendar_invite" | "learning_assignment" | "hiring_requisition" | "retention_review"
    title: string
    evidence: string
    requiresConfirmation: true
  }
}

type ConversationSummary = {
  id: string
  title: string
  messageCount: number
  updatedAt: string
}

const toolLabels: Record<string, string> = {
  workforce_overview: "Workforce overview",
  compare_departments: "Department comparison",
  analyze_attrition_signals: "Attrition signals",
  review_people_operations: "People operations",
  find_employee_records: "Employee directory",
  review_work_queue: "Current work queue",
  review_onboarding_readiness: "Onboarding readiness",
  review_capability_plan: "Capability plan",
}

const defaultSuggestedPrompts = [
  "Summarize the current workforce and open HR work",
  "Build a retention review plan for the top 5 attrition-risk records",
  "Where are exits concentrated by manager?",
  "Which departments have a replacement coverage gap?",
]

function welcomeMessage(dataMode: string): ChatMessage {
  return {
    role: "assistant",
    content: "Ask a workforce question. Follow-up questions use this conversation.",
    dataMode,
  }
}

export function AgentCopilot({ dataMode, pageContext, compact = false }: { dataMode: string; pageContext?: AssistantPageContext; compact?: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage(dataMode)])
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [conversationId, setConversationId] = useState("")
  const [input, setInput] = useState("")
  const [thinking, setThinking] = useState(false)
  const [streamStatus, setStreamStatus] = useState("Reviewing workspace data")
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [conversationError, setConversationError] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)
  const conversationIdRef = useRef("")

  async function refreshConversations(preferredId?: string) {
    const response = await fetch("/api/v1/chat/conversations", { cache: "no-store" })
    if (!response.ok) throw new Error("Conversation history is unavailable.")
    const body = await response.json() as { conversations?: ConversationSummary[] }
    const rows = body.conversations ?? []
    setConversations(rows)
    return preferredId ?? rows[0]?.id ?? ""
  }

  async function loadConversation(id: string) {
    if (!id) return
    setLoadingHistory(true)
    try {
      const response = await fetch(`/api/v1/chat/conversations/${encodeURIComponent(id)}`, { cache: "no-store" })
      if (!response.ok) throw new Error("This conversation could not be loaded.")
      const body = await response.json() as { messages?: ChatMessage[] }
      conversationIdRef.current = id
      setConversationId(id)
      setMessages(body.messages?.length ? body.messages : [welcomeMessage(dataMode)])
    } catch (error) {
      conversationIdRef.current = ""
      setConversationId("")
      setMessages([{ role: "assistant", content: error instanceof Error ? error.message : "Conversation history is unavailable." }])
    } finally {
      setLoadingHistory(false)
    }
  }

  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => {
      void refreshConversations()
        .then((latestId) => active && latestId && !compact ? loadConversation(latestId) : undefined)
        .catch(() => undefined)
        .finally(() => { if (active) setLoadingHistory(false) })
    }, 0)
    return () => { active = false; window.clearTimeout(timer) }
    // The data mode is fixed for the page lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function resetConversationState() {
    conversationIdRef.current = ""
    setConversationId("")
    setMessages([welcomeMessage(dataMode)])
    setInput("")
    setConversationError("")
  }

  function newConversation() {
    if (thinking || deleting) return
    resetConversationState()
  }

  async function deleteActiveConversation() {
    const activeId = conversationIdRef.current
    if (!activeId || deleting || thinking) return
    setDeleting(true)
    setConversationError("")
    try {
      const response = await fetch(`/api/v1/chat/conversations/${encodeURIComponent(activeId)}`, { method: "DELETE" })
      const body = await response.json() as { detail?: string }
      if (!response.ok) throw new Error(body.detail ?? "The conversation could not be deleted.")
      setDeleteOpen(false)
      resetConversationState()
      const nextId = await refreshConversations()
      if (nextId) await loadConversation(nextId)
    } catch (error) {
      setConversationError(error instanceof Error ? error.message : "The conversation could not be deleted.")
    } finally {
      setDeleting(false)
    }
  }

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || thinking || loadingHistory) return
    setMessages((current) => [...current, { role: "user", content: trimmed }])
    setInput("")
    setThinking(true)
    setStreamStatus("Reviewing workspace records")
    const activeConversationId = conversationIdRef.current
    const streamMessageId = `stream-${crypto.randomUUID()}`
    try {
      const response = await fetch("/api/v1/chat", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify({ message: trimmed, conversationId: activeConversationId || undefined, stream: true, pageContext }),
      })
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => ({})) as { detail?: string }
        throw new Error(body.detail ?? "The assistant is unavailable.")
      }

      setMessages((current) => [...current, { id: streamMessageId, role: "assistant", content: "" }])
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let nextConversationId = activeConversationId
      let streamError = ""

      while (true) {
        const { done, value } = await reader.read()
        buffer += decoder.decode(value, { stream: !done })
        const events = buffer.split("\n\n")
        buffer = events.pop() ?? ""
        for (const block of events) {
          const lines = block.split("\n")
          const eventName = lines.find((line) => line.startsWith("event:"))?.slice(6).trim()
          const dataLine = lines.find((line) => line.startsWith("data:"))?.slice(5).trim()
          if (!eventName || !dataLine) continue
          const payload = JSON.parse(dataLine) as {
            text?: string
            message?: string
            detail?: string
            conversationId?: string
            tools?: ChatMessage["tools"]
            context?: ChatMessage["context"]
            dataMode?: string
            workflow?: ChatMessage["workflow"]
          }
          if (eventName === "conversation" && payload.conversationId) {
            nextConversationId = payload.conversationId
            conversationIdRef.current = payload.conversationId
            setConversationId(payload.conversationId)
          }
          if (eventName === "progress" && payload.message) setStreamStatus(payload.message)
          if (eventName === "delta" && payload.text) {
            setMessages((current) => current.map((message) => message.id === streamMessageId
              ? { ...message, content: message.content + payload.text }
              : message))
          }
          if (eventName === "metadata") {
            setMessages((current) => current.map((message) => message.id === streamMessageId
              ? { ...message, tools: payload.tools, context: payload.context, dataMode: payload.dataMode, workflow: payload.workflow }
              : message))
          }
          if (eventName === "error") streamError = payload.detail ?? "The assistant is unavailable."
        }
        if (done) break
      }
      if (streamError) throw new Error(streamError)
      if (nextConversationId) await refreshConversations(nextConversationId)
    } catch (error) {
      const content = error instanceof Error ? error.message : "The assistant is unavailable."
      setMessages((current) => current.some((message) => message.id === streamMessageId)
        ? current.map((message) => message.id === streamMessageId ? { ...message, content } : message)
        : [...current, { role: "assistant", content }])
    } finally {
      setThinking(false)
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }))
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn("items-center gap-2 border-b border-border bg-card px-4 py-2.5", compact ? "flex justify-end" : "flex")}>
        {!compact && <>
        <label className="min-w-0 flex-1 text-meta font-semibold text-muted-foreground">
          Conversation
          <select
            value={conversationId}
            onChange={(event) => { if (event.target.value) void loadConversation(event.target.value); else newConversation() }}
            disabled={thinking || loadingHistory}
            className="ml-2 h-8 max-w-[420px] rounded-md border border-border bg-background px-2 text-xs font-normal text-foreground"
            aria-label="Select a recent conversation"
          >
            <option value="">New conversation</option>
            {conversations.map((conversation) => <option key={conversation.id} value={conversation.id}>{conversation.title}</option>)}
          </select>
        </label>
        </>}
        <Button type="button" size="sm" variant="outline" onClick={newConversation} disabled={thinking || loadingHistory || deleting}>New chat</Button>
        {!compact && <Button type="button" size="sm" variant="outline" onClick={() => { setConversationError(""); setDeleteOpen(true) }} disabled={!conversationId || thinking || loadingHistory || deleting}>Delete chat</Button>}
      </div>

      {conversationError && !deleteOpen && <div role="alert" className="border-b border-border bg-destructive/5 px-4 py-2 text-xs text-destructive">{conversationError}</div>}

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
        {loadingHistory ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin"/>Loading conversation</div>
        ) : messages.map((message, index) => (
          <article key={message.id ?? index} className={cn("flex", message.role === "user" && "justify-end")}>
            <div className="max-w-[88%]">
              <div className={cn(
                "whitespace-pre-wrap rounded-md px-3.5 py-3 text-sm",
                message.role === "assistant" ? "border border-border bg-background text-foreground" : "bg-secondary text-secondary-foreground",
              )}>
                {message.content.replace(/\*\*/g, "").replace(/_([^_]+)_/g, "$1")}
              </div>
              {message.role === "assistant" && ((message.tools?.length ?? 0) > 0 || (message.context?.length ?? 0) > 0) && (
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-meta text-muted-foreground">
                  <span>Sources:</span>
                  {message.tools?.map((trace) => <span key={trace.tool}>{toolLabels[trace.tool] ?? trace.tool}</span>)}
                  {message.context?.map((item) => <span key={`${item.source}-${item.section}`}>{item.source.startsWith("Azure AI Search") ? `Azure AI Search · ${item.section}` : item.section}</span>)}
                </div>
              )}
              {message.role === "assistant" && message.workflow && (
                <div className="mt-3 rounded-md border border-border bg-card p-3">
                  <p className="text-label font-semibold">Prepared workflow</p>
                  <p className="mt-1 text-body font-semibold">{message.workflow.title}</p>
                  <p className="mt-1 text-meta text-muted-foreground">{message.workflow.evidence}</p>
                  <Link
                    href={`/assistant?view=workflows&prompt=${encodeURIComponent(message.workflow.prompt)}`}
                    className="mt-3 inline-flex h-8 items-center rounded-md bg-primary px-3 text-control font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    Review and confirm
                  </Link>
                </div>
              )}
            </div>
          </article>
        ))}
        {thinking && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            {streamStatus}
          </div>
        )}
      </div>

      <div className="border-t border-border bg-card px-4 py-4">
        <div className={cn("mb-3 grid gap-1", !compact && "sm:grid-cols-2")}>
          {(pageContext ? assistantPagePrompts(pageContext) : defaultSuggestedPrompts).map((prompt) => (
            <button key={prompt} type="button" onClick={() => void send(prompt)} className="border-l-2 border-border px-2 py-1 text-left text-xs text-muted-foreground hover:border-primary hover:text-foreground">
              {prompt}
            </button>
          ))}
        </div>
        <form onSubmit={(event) => { event.preventDefault(); void send(input) }} className="flex items-end gap-2 rounded-md border border-input bg-background p-1.5 pl-3 focus-within:ring-2 focus-within:ring-ring/30">
          <textarea
            rows={1}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                void send(input)
              }
            }}
            placeholder={pageContext ? `Ask about ${pageContext.label.toLowerCase()}` : "Ask a workforce analytics question"}
            className="max-h-32 min-h-9 flex-1 resize-none bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
          />
          <Button type="submit" size="icon" disabled={!input.trim() || thinking || loadingHistory} aria-label="Send question"><ArrowUp className="size-4" /></Button>
        </form>
        <p className="mt-2 text-meta text-muted-foreground">Uses the current page, live workspace records, and the knowledge index.</p>
      </div>

      {deleteOpen && conversationId && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-foreground/25 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-conversation-title">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-none">
            <h3 id="delete-conversation-title" className="text-base font-semibold">Delete conversation?</h3>
            <p className="mt-2 text-sm text-muted-foreground">This permanently removes “{conversations.find((conversation) => conversation.id === conversationId)?.title ?? "this conversation"}” and its message history.</p>
            {conversationError && <p role="alert" className="mt-3 text-xs text-destructive">{conversationError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => { setDeleteOpen(false); setConversationError("") }} disabled={deleting}>Cancel</Button>
              <Button type="button" variant="destructive" onClick={() => void deleteActiveConversation()} disabled={deleting}>{deleting ? <><LoaderCircle className="size-4 animate-spin"/>Deleting</> : "Delete conversation"}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
