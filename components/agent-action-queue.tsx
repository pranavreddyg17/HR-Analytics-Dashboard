"use client"

import { useState } from "react"
import { Check, Loader2, Clock, ShieldCheck, Bot, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { apiBaseUrl } from "@/lib/api"
import type { AgentAction, AgentActionStatus } from "@/lib/types"

const statusMeta: Record<
  Exclude<AgentActionStatus, "dismissed">,
  { label: string; className: string; icon: typeof Check }
> = {
  needs_approval: {
    label: "Needs approval",
    className: "bg-warning/15 text-warning ring-warning/25",
    icon: ShieldCheck,
  },
  running: {
    label: "In review",
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

export function AgentActionQueue({ initialActions }: { initialActions: AgentAction[] }) {
  const [actions, setActions] = useState<AgentAction[]>(initialActions)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function update(id: string, status: AgentActionStatus) {
    setBusyId(id)
    setError(null)
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/actions/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { detail?: string } | null
        throw new Error(body?.detail ?? `Action update failed (${response.status})`)
      }
      if (status === "dismissed") {
        setActions((current) => current.filter((action) => action.id !== id))
      } else {
        setActions((current) => current.map((action) => action.id === id ? { ...action, status } : action))
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Action update failed.")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {actions.map((action) => {
        if (action.status === "dismissed") return null
        const meta = statusMeta[action.status]
        const StatusIcon = meta.icon
        const busy = busyId === action.id
        return (
          <div key={action.id} className="rounded-xl bg-muted/40 p-3.5 ring-1 ring-border/60">
            <div className="flex items-start gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Bot className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{action.title}</p>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                      meta.className,
                    )}
                  >
                    <StatusIcon className={cn("size-3", action.status === "running" && "animate-spin")} />
                    {meta.label}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground text-pretty">{action.detail}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{action.agent}</span>
                  <span>{action.impact}</span>
                  <span>Evidence score {action.confidence}%</span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {action.status === "needs_approval" && (
                    <Button size="sm" className="gap-1.5" disabled={busy} onClick={() => void update(action.id, "running")}>
                      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                      Approve review
                    </Button>
                  )}
                  {action.status === "pending" && (
                    <Button size="sm" className="gap-1.5" disabled={busy} onClick={() => void update(action.id, "running")}>
                      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                      Start review
                    </Button>
                  )}
                  {action.status === "running" && (
                    <Button size="sm" className="gap-1.5" disabled={busy} onClick={() => void update(action.id, "completed")}>
                      <Check className="size-3.5" />
                      Mark completed
                    </Button>
                  )}
                  {action.status !== "completed" && (
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => void update(action.id, "dismissed")}>
                      <X className="size-3.5" />
                      Dismiss
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })}
      {actions.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No review actions remain.</p>}
      {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    </div>
  )
}
