"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowUp, LoaderCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type ChatMessage = {
  id?: string
  role: "user" | "assistant"
  content: string
  tools?: Array<{ tool: string; status: string }>
  context?: Array<{ source: string; section: string }>
  dataMode?: string
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
}

const suggestedPrompts = [
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

export function AgentCopilot({ dataMode }: { dataMode: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage(dataMode)])
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [conversationId, setConversationId] = useState("")
  const [input, setInput] = useState("")
  const [thinking, setThinking] = useState(false)
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
    refreshConversations()
      .then((latestId) => active && latestId ? loadConversation(latestId) : undefined)
      .catch(() => undefined)
      .finally(() => { if (active) setLoadingHistory(false) })
    return () => { active = false }
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
    const activeConversationId = conversationIdRef.current
    try {
      const response = await fetch("/api/v1/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: trimmed, conversationId: activeConversationId || undefined }),
      })
      const body = await response.json() as {
        answer?: string
        detail?: string
        tools?: ChatMessage["tools"]
        context?: ChatMessage["context"]
        dataMode?: string
        conversationId?: string
      }
      if (!response.ok) throw new Error(body.detail ?? "The assistant is unavailable.")
      const nextConversationId = body.conversationId ?? activeConversationId
      conversationIdRef.current = nextConversationId
      setConversationId(nextConversationId)
      setMessages((current) => [...current, {
        role: "assistant",
        content: body.answer ?? "No answer was returned.",
        tools: body.tools,
        context: body.context,
        dataMode: body.dataMode,
      }])
      await refreshConversations(nextConversationId)
    } catch (error) {
      setMessages((current) => [...current, {
        role: "assistant",
        content: error instanceof Error ? error.message : "The assistant is unavailable.",
      }])
    } finally {
      setThinking(false)
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }))
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border bg-card px-4 py-2.5">
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
        <Button type="button" size="sm" variant="outline" onClick={newConversation} disabled={thinking || loadingHistory || deleting}>New chat</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => { setConversationError(""); setDeleteOpen(true) }} disabled={!conversationId || thinking || loadingHistory || deleting}>Delete chat</Button>
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
                  {message.context?.map((item) => <span key={`${item.source}-${item.section}`}>{item.section}</span>)}
                </div>
              )}
            </div>
          </article>
        ))}
        {thinking && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Reviewing workspace data
          </div>
        )}
      </div>

      <div className="border-t border-border bg-card px-4 py-4">
        <div className="mb-3 grid gap-1 sm:grid-cols-2">
          {suggestedPrompts.map((prompt) => (
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
            placeholder="Ask a workforce analytics question"
            className="max-h-32 min-h-9 flex-1 resize-none bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
          />
          <Button type="submit" size="icon" disabled={!input.trim() || thinking || loadingHistory} aria-label="Send question"><ArrowUp className="size-4" /></Button>
        </form>
        <p className="mt-2 text-meta text-muted-foreground">Conversation context is saved to your account.</p>
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
