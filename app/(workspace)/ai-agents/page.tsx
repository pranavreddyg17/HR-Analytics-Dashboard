import { AgentCopilot } from "@/components/agent-copilot"
import { AgentWorkflows } from "@/components/agent-workflows"
import { getWorkforceAnalytics } from "@/lib/server/hr-analytics"
import { getRequestActor } from "@/lib/server/request-user"

export const dynamic = "force-dynamic"

function workspaceMode(status: Awaited<ReturnType<typeof getWorkforceAnalytics>>["status"]): "Demo" | "Mixed" | "Operational" {
  const modes = new Set(status.filter((item) => item.count > 0).map((item) => item.mode))
  if (modes.size === 1 && modes.has("demo")) return "Demo"
  if (modes.size > 0 && [...modes].every((mode) => mode === "imported")) return "Operational"
  return "Mixed"
}

export default async function AiAgentsPage() {
  const [analytics, actor] = await Promise.all([getWorkforceAnalytics(), getRequestActor()])
  const mode = workspaceMode(analytics.status)
  const canPrepare = Boolean(actor && ["admin", "hr", "manager"].includes(actor.role))

  return (
    <div className="mx-auto flex w-full max-w-[1520px] flex-col gap-6 pb-10">
      <header className="border-b border-border pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">AI Assistant</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Analyze workforce records and create reviewed calendar actions.</p>
        </div>
      </header>

      <div>
        <section className="flex h-[720px] min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-muted/20">
          <div className="border-b border-border bg-card px-5 py-4">
            <h2 className="text-sm font-semibold">Workforce analytics</h2>
            <p className="mt-1 text-xs text-muted-foreground">Answers use workspace records and HR guidance from the knowledge base.</p>
          </div>
          <AgentCopilot dataMode={mode.toLowerCase()} />
        </section>
      </div>

      <section>
        <div className="mb-3">
          <h2 className="text-base font-semibold">Calendar workflow</h2>
          <p className="mt-1 text-xs text-muted-foreground">Describe a meeting in plain language, review the matched employees, then create the event and send Google Calendar invitations.</p>
        </div>
        <AgentWorkflows canPrepare={canPrepare} />
      </section>
    </div>
  )
}
