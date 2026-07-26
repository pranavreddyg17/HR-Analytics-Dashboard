"use client"

import { useState } from "react"
import { Check, Loader2, Clock, ShieldCheck, Bot } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { agentActions, type AgentAction, type AgentActionStatus } from "@/lib/data"

const statusMeta: Record<
  AgentActionStatus,
  { label: string; className: string; icon: typeof Check }
> = {
  needs_approval: {
    label: "Needs approval",
    className: "bg-warning/15 text-warning ring-warning/25",
    icon: ShieldCheck,
  },
  running: {
    label: "Running",
    className: "bg-primary/15 text-primary ring-primary/25",
    icon: Loader2,
  },
  pending: {
    label: "Queued",
    className: "bg-muted text-muted-foreground ring-border",
    icon: Clock,
  },
  completed: {
    label: "Completed",
    className: "bg-success/15 text-success ring-success/25",
    icon: Check,
  },
}

export function AgentActionQueue() {
  const [actions, setActions] = useState<AgentAction[]>(agentActions)

  function approve(id: string) {
    setActions((prev) => prev.map((a) => (a.id === id ? { ...a, status: "running" } : a)))
    setTimeout(() => {
      setActions((prev) => prev.map((a) => (a.id === id ? { ...a, status: "completed" } : a)))
    }, 1600)
  }

  function dismiss(id: string) {
    setActions((prev) => prev.filter((a) => a.id !== id))
  }

  return (
    <div className="flex flex-col gap-3">
      {actions.map((a) => {
        const meta = statusMeta[a.status]
        const StatusIcon = meta.icon
        return (
          <div key={a.id} className="rounded-xl bg-muted/40 p-3.5 ring-1 ring-border/60">
            <div className="flex items-start gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Bot className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{a.title}</p>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                      meta.className,
                    )}
                  >
                    <StatusIcon className={cn("size-3", a.status === "running" && "animate-spin")} />
                    {meta.label}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground text-pretty">{a.detail}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{a.agent}</span>
                  <span>{a.impact}</span>
                  <span>Confidence {a.confidence}%</span>
                </div>

                {a.status === "needs_approval" && (
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" className="gap-1.5" onClick={() => approve(a.id)}>
                      <Check className="size-3.5" />
                      Approve & run
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => dismiss(a.id)}>
                      Dismiss
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
