"use client"

import { useRef, useState } from "react"
import { ArrowUp, LoaderCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type ChatMessage = {
  role: "user" | "assistant"
  content: string
  tools?: Array<{ tool: string; status: string }>
  context?: Array<{ source: string; section: string }>
  dataMode?: string
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
  "Compare attrition across departments",
  "Which mandatory training needs follow-up?",
  "Which active employees meet the mobility review criteria?",
]

export function AgentCopilot({ dataMode }: { dataMode: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "Ask a question about workforce data, HR operations, or model results. I will use the current workspace records and identify the source mode in the answer.",
      dataMode,
    },
  ])
  const [input, setInput] = useState("")
  const [thinking, setThinking] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || thinking) return
    setMessages((current) => [...current, { role: "user", content: trimmed }])
    setInput("")
    setThinking(true)
    try {
      const response = await fetch("/api/v1/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      })
      const body = await response.json() as {
        answer?: string
        detail?: string
        tools?: ChatMessage["tools"]
        context?: ChatMessage["context"]
        dataMode?: string
      }
      if (!response.ok) throw new Error(body.detail ?? "The assistant is unavailable.")
      setMessages((current) => [...current, {
        role: "assistant",
        content: body.answer ?? "No answer was returned.",
        tools: body.tools,
        context: body.context,
        dataMode: body.dataMode,
      }])
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
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
        {messages.map((message, index) => (
          <article key={index} className={cn("flex", message.role === "user" && "justify-end")}>
            <div className="max-w-[88%]">
              <div className={cn(
                "whitespace-pre-wrap rounded-md px-3.5 py-3 text-sm leading-6",
                message.role === "assistant" ? "border border-border bg-background text-foreground" : "bg-secondary text-secondary-foreground",
              )}>
                {message.content.replace(/\*\*/g, "").replace(/_([^_]+)_/g, "$1")}
              </div>
              {message.role === "assistant" && ((message.tools?.length ?? 0) > 0 || (message.context?.length ?? 0) > 0) && (
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[10px] text-muted-foreground">
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
          <Button type="submit" size="icon" disabled={!input.trim() || thinking} aria-label="Send question"><ArrowUp className="size-4" /></Button>
        </form>
        <p className="mt-2 text-[10px] text-muted-foreground">Decision support only. Confirm employee-level actions through normal HR review.</p>
      </div>
    </div>
  )
}
