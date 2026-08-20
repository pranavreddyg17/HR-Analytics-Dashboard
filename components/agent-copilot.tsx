"use client"

import { useEffect, useRef, useState } from "react"
import { LoaderCircle } from "lucide-react"
import Link from "next/link"
import { AnimatePresence, useReducedMotion } from "motion/react"
import * as m from "motion/react-m"

import { AssistantRichText } from "@/components/assistant-rich-text"
import styles from "@/components/ai-surfaces.module.css"
import { Button } from "@/components/ui/button"
import { assistantPagePrompts, type AssistantPageContext } from "@/lib/assistant-page-context"
import { cn } from "@/lib/utils"

export type AssistantWorkflow = {
  prompt: string
  type: "calendar_invite" | "learning_assignment" | "hiring_requisition" | "retention_review"
  title: string
  evidence: string
  requiresConfirmation: true
}

type ChatMessage = {
  id?: string
  role: "user" | "assistant"
  content: string
  tools?: Array<{ tool: string; status: string }>
  context?: Array<{ source: string; section: string }>
  dataMode?: string
  workflow?: AssistantWorkflow
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

export function AgentCopilot({ dataMode, pageContext, compact = false, onReviewWorkflow }: { dataMode: string; pageContext?: AssistantPageContext; compact?: boolean; onReviewWorkflow?: (workflow: AssistantWorkflow) => void }) {
  const reduceMotion = useReducedMotion()
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage(dataMode)])
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [conversationId, setConversationId] = useState("")
  const [input, setInput] = useState("")
  const [thinking, setThinking] = useState(false)
  const [streamStatus, setStreamStatus] = useState("Reviewing workspace data")
  const [announcement, setAnnouncement] = useState("")
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [conversationError, setConversationError] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)
  const conversationIdRef = useRef("")
  const deleteDialogRef = useRef<HTMLDivElement>(null)
  const cancelDeleteRef = useRef<HTMLButtonElement>(null)
  const stickToBottomRef = useRef(true)

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

  useEffect(() => {
    if (!thinking || !stickToBottomRef.current) return
    const frame = window.requestAnimationFrame(() => {
      const container = scrollRef.current
      if (container) container.scrollTop = container.scrollHeight
    })
    return () => window.cancelAnimationFrame(frame)
  }, [messages, thinking])

  useEffect(() => {
    if (!deleteOpen) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const frame = window.requestAnimationFrame(() => cancelDeleteRef.current?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        setDeleteOpen(false)
        setConversationError("")
        return
      }
      if (event.key !== "Tab" || !deleteDialogRef.current) return
      const focusable = [...deleteDialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')]
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener("keydown", onKeyDown)
      document.body.style.overflow = previousOverflow
      previous?.focus()
    }
  }, [deleteOpen])

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
    stickToBottomRef.current = true
    setInput("")
    setThinking(true)
    setStreamStatus("Reviewing workspace records")
    setAnnouncement("Reviewing workspace records")
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
          if (eventName === "progress" && payload.message) {
            setStreamStatus(payload.message)
            setAnnouncement(payload.message)
          }
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
      setAnnouncement("Assistant response ready.")
      if (stickToBottomRef.current) requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" }))
    }
  }

  return (
    <div className={styles.copilot} aria-busy={thinking || loadingHistory}>
      <div className={cn(styles.copilotToolbar, compact && "justify-end")}>
        {!compact && <>
        <label className="min-w-0 flex-1 text-meta font-semibold text-muted-foreground">
          Conversation
          <select
            value={conversationId}
            onChange={(event) => { if (event.target.value) void loadConversation(event.target.value); else newConversation() }}
            disabled={thinking || loadingHistory}
            className={styles.conversationSelect}
            aria-label="Select a recent conversation"
          >
            <option value="">New conversation</option>
            {conversations.map((conversation) => <option key={conversation.id} value={conversation.id}>{conversation.title}</option>)}
          </select>
        </label>
        </>}
        <Button type="button" size="sm" variant="outline" onClick={newConversation} disabled={thinking || loadingHistory || deleting}>New conversation</Button>
        {!compact && <Button type="button" size="sm" variant="outline" onClick={() => { setConversationError(""); setDeleteOpen(true) }} disabled={!conversationId || thinking || loadingHistory || deleting}>Delete</Button>}
      </div>

      {conversationError && !deleteOpen && <div role="alert" className="border-b border-border bg-destructive/5 px-4 py-2 text-xs text-destructive">{conversationError}</div>}

      <div
        ref={scrollRef}
        className={styles.messageList}
        role="log"
        aria-label="Conversation"
        aria-live="off"
        onScroll={(event) => {
          const element = event.currentTarget
          stickToBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 96
        }}
      >
        <div className={styles.messageStack}>
        {loadingHistory ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin"/>Loading conversation</div>
        ) : messages.map((message, index) => {
          const pendingStream = message.id?.startsWith("stream-") && !message.content
          if (pendingStream) return null
          return (
          <m.article
            key={message.id ?? index}
            className={cn(styles.messageRow, message.role === "user" && styles.messageRowUser)}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0.01 : 0.18 }}
            aria-label={message.role === "assistant" ? "Assistant response" : "Your message"}
          >
            <div className={styles.messageContent}>
              <div className={cn(
                styles.bubble,
                "px-3.5 py-3",
                message.role === "assistant" ? styles.bubbleAssistant : styles.bubbleUser,
              )}>
                {message.role === "assistant" ? <AssistantRichText content={message.content} /> : <p className="whitespace-pre-wrap text-body">{message.content}</p>}
              </div>
              {message.role === "assistant" && ((message.tools?.length ?? 0) > 0 || (message.context?.length ?? 0) > 0) && (
                <details className={styles.evidence}>
                  <summary className="w-fit cursor-pointer select-none hover:text-foreground">Evidence used</summary>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                    {message.tools?.map((trace) => <span key={trace.tool}>{toolLabels[trace.tool] ?? trace.tool}</span>)}
                    {message.context?.map((item) => <span key={`${item.source}-${item.section}`}>{item.source.startsWith("Azure AI Search") ? `Azure AI Search · ${item.section}` : item.section}</span>)}
                  </div>
                </details>
              )}
              {message.role === "assistant" && message.workflow && (
                <div className={styles.preparedAction}>
                  <p className="text-label font-semibold">Prepared action</p>
                  <p className="mt-1 text-body font-semibold">{message.workflow.title}</p>
                  <p className="mt-1 text-meta text-muted-foreground">{message.workflow.evidence}</p>
                  {onReviewWorkflow ? <Button type="button" size="sm" className="mt-3" onClick={() => onReviewWorkflow(message.workflow!)}>Review action</Button> : <Link href={`/assistant?view=actions&prompt=${encodeURIComponent(message.workflow.prompt)}`} className="mt-3 inline-flex h-8 items-center rounded-md bg-primary px-3 text-control font-semibold text-primary-foreground hover:bg-primary/90">Review action</Link>}
                </div>
              )}
            </div>
          </m.article>
          )
        })}
        {thinking && (
          <m.div className={styles.streamStatus} aria-hidden="true" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <span className={styles.streamOrb} aria-hidden="true" />
            {streamStatus}
          </m.div>
        )}
        </div>
      </div>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>

      <div className={styles.composerArea}>
        <div className={cn(styles.suggestions, !compact && styles.suggestionsWide)}>
          {(pageContext ? assistantPagePrompts(pageContext) : defaultSuggestedPrompts).map((prompt) => (
            <m.button key={prompt} type="button" onClick={() => void send(prompt)} className={styles.suggestion} whileTap={reduceMotion ? undefined : { scale: 0.99 }}>
              {prompt}
            </m.button>
          ))}
        </div>
        <form onSubmit={(event) => { event.preventDefault(); void send(input) }} className={styles.composer}>
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
          <Button type="submit" size="sm" disabled={!input.trim() || thinking || loadingHistory}>Send</Button>
        </form>
        <p className="mt-2 text-meta text-muted-foreground">Uses the current page, live workspace records, and the knowledge index.</p>
      </div>

      <AnimatePresence>
      {deleteOpen && conversationId && (
        <m.div className={styles.dialogBackdrop} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <m.div ref={deleteDialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="delete-conversation-title" initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 4 }}>
            <h3 id="delete-conversation-title" className="text-base font-semibold">Delete conversation?</h3>
            <p className="mt-2 text-sm text-muted-foreground">This permanently removes “{conversations.find((conversation) => conversation.id === conversationId)?.title ?? "this conversation"}” and its message history.</p>
            {conversationError && <p role="alert" className="mt-3 text-xs text-destructive">{conversationError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Button ref={cancelDeleteRef} type="button" variant="ghost" onClick={() => { setDeleteOpen(false); setConversationError("") }} disabled={deleting}>Cancel</Button>
              <Button type="button" variant="destructive" onClick={() => void deleteActiveConversation()} disabled={deleting}>{deleting ? <><LoaderCircle className="size-4 animate-spin"/>Deleting</> : "Delete conversation"}</Button>
            </div>
          </m.div>
        </m.div>
      )}
      </AnimatePresence>
    </div>
  )
}
