"use client"

import { useRef, useState } from "react"
import { ArrowUp, CheckCircle2, Sparkles, User, Wrench } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { apiBaseUrl } from "@/lib/api"

type ChatMessage = {
  role: "user" | "assistant"
  content: string
  tools?: Array<{ tool: string; durationMs: number; status: string }>
}

const suggestedPrompts = [
  "Give me an executive workforce summary",
  "Which department has the highest attrition?",
  "What hiring source is most effective?",
  "Which mandatory training is incomplete?",
  "Where is career progression stalled?",
  "Break down employees by location and status",
]

export function AgentCopilot({ initialBrief }: { initialBrief: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: initialBrief },
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
      const response = await fetch(`${apiBaseUrl}/api/v1/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      })
      if (!response.ok) throw new Error(`Chat request failed (${response.status})`)
      const body = await response.json() as { answer: string; tools?: ChatMessage["tools"] }
      setMessages((current) => [...current, { role: "assistant", content: body.answer, tools: body.tools }])
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: error instanceof Error ? error.message : "The analytics service is unavailable.",
        },
      ])
    } finally {
      setThinking(false)
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
      })
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto pr-1">
        {messages.map((message, index) => (
          <div key={index} className={cn("flex gap-2.5", message.role === "user" && "flex-row-reverse")}>
            <div
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-lg",
                message.role === "assistant" ? "bg-primary/15 text-primary" : "bg-secondary text-foreground",
              )}
            >
              {message.role === "assistant" ? <Sparkles className="size-3.5" /> : <User className="size-3.5" />}
            </div>
            <div className="max-w-[84%]">
              <div
                className={cn(
                  "whitespace-pre-wrap rounded-xl px-3.5 py-2.5 text-sm leading-relaxed text-pretty",
                  message.role === "assistant"
                    ? "bg-muted/60 text-foreground"
                    : "bg-primary text-primary-foreground",
                )}
              >
                {message.content.replace(/\*\*/g, "").replace(/_([^_]+)_/g, "$1")}
              </div>
              {message.tools && message.tools.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {message.tools.map((trace, traceIndex) => (
                    <span key={`${trace.tool}-${traceIndex}`} className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2 py-1 text-[10px] text-muted-foreground">
                      {trace.status === "completed" ? <CheckCircle2 className="size-3 text-success" /> : <Wrench className="size-3 text-warning" />}
                      MCP · {trace.tool} · {trace.durationMs}ms
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="flex gap-2.5">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Sparkles className="size-3.5" />
            </div>
            <div className="flex items-center gap-1 rounded-xl bg-muted/60 px-3.5 py-3">
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <div className="flex flex-wrap gap-1.5">
          {suggestedPrompts.map((prompt) => (
            <button
              key={prompt}
              onClick={() => send(prompt)}
              className="rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              {prompt}
            </button>
          ))}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void send(input)
          }}
          className="flex items-center gap-2 rounded-xl border border-border bg-card p-1.5 pl-3.5 focus-within:ring-2 focus-within:ring-ring/40"
        >
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask across hiring, attrition, leave, training, or promotions..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <Button type="submit" size="icon" disabled={!input.trim() || thinking} aria-label="Send">
            <ArrowUp className="size-4" />
          </Button>
        </form>
      </div>
    </div>
  )
}
