"use client"

import { useRef, useState } from "react"
import { Sparkles, ArrowUp, User } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { seedConversation, suggestedPrompts, type ChatMessage } from "@/lib/data"

// Canned responses so the copilot feels alive without a backend.
function generateReply(prompt: string): string {
  const p = prompt.toLowerCase()
  if (p.includes("sales")) {
    return "Sales attrition is 21.4% — the highest of any org. The model attributes 61% of that to below-market compa-ratios (avg 0.86). I can draft off-cycle adjustments for the 12 highest-risk reps, projected to retain ~7 of them. Want me to queue that for approval?"
  }
  if (p.includes("engineering")) {
    return "Engineering has 118 at-risk employees, mostly senior ICs stalled without promotion (avg 26 months). Recommended plan: fast-track 9 promotion reviews, refresh equity for 14 staff engineers, and enroll 20 into the Leadership Academy. Estimated attrition reduction: 3.1 points."
  }
  if (p.includes("summar") || p.includes("risk")) {
    return "This month: 386 employees flagged at 60%+ risk (up 4.6%). Top drivers are compensation (28%) and stalled growth (24%). 6 engineers and 4 AEs are in the critical band. I've prepared retention offers awaiting your approval in the action queue."
  }
  return "I analyzed the current workforce signals. The most impactful next step is addressing compensation gaps in Sales and promotion velocity in Engineering. I can turn any of these into an automated action — just tell me which to prioritize."
}

export function AgentCopilot() {
  const [messages, setMessages] = useState<ChatMessage[]>(seedConversation)
  const [input, setInput] = useState("")
  const [thinking, setThinking] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || thinking) return
    setMessages((m) => [...m, { role: "user", content: trimmed }])
    setInput("")
    setThinking(true)
    setTimeout(() => {
      setMessages((m) => [...m, { role: "assistant", content: generateReply(trimmed) }])
      setThinking(false)
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
      })
    }, 700)
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto pr-1">
        {messages.map((m, i) => (
          <div key={i} className={cn("flex gap-2.5", m.role === "user" && "flex-row-reverse")}>
            <div
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-lg",
                m.role === "assistant" ? "bg-primary/15 text-primary" : "bg-secondary text-foreground",
              )}
            >
              {m.role === "assistant" ? <Sparkles className="size-3.5" /> : <User className="size-3.5" />}
            </div>
            <div
              className={cn(
                "max-w-[82%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed text-pretty",
                m.role === "assistant"
                  ? "bg-muted/60 text-foreground"
                  : "bg-primary text-primary-foreground",
              )}
            >
              {m.content}
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
          {suggestedPrompts.map((p) => (
            <button
              key={p}
              onClick={() => send(p)}
              className="rounded-full border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              {p}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            send(input)
          }}
          className="flex items-center gap-2 rounded-xl border border-border bg-card p-1.5 pl-3.5 focus-within:ring-2 focus-within:ring-ring/40"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                e.preventDefault()
                send(input)
              }
            }}
            placeholder="Ask about attrition, draft a plan, or trigger an agent..."
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
