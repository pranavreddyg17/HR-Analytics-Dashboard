import { AgentCopilot } from "@/components/agent-copilot"
import { AgentWorkflows } from "@/components/agent-workflows"
import { getWorkforceAnalytics } from "@/lib/server/hr-analytics"
import { getRequestActor } from "@/lib/server/request-user"

export const dynamic = "force-dynamic"

const capabilities = [
  { label: "Workforce overview", detail: "Headcount, movement, open work, and source status" },
  { label: "Department comparison", detail: "Hiring, exits, leave, learning, and promotions" },
  { label: "Attrition analysis", detail: "Observed exits and historical model results" },
  { label: "People operations", detail: "Hiring, leave, training, and promotion exceptions" },
  { label: "Employee lookup", detail: "Current employee directory records" },
]

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
      <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics assistant</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Analyze workforce data and prepare employee communications.</p>
        </div>
        <p className="text-xs text-muted-foreground">Data source: <b className="font-semibold text-foreground">{mode}</b></p>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex h-[680px] min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-muted/20">
          <div className="border-b border-border bg-card px-5 py-4">
            <h2 className="text-sm font-semibold">Workforce analytics</h2>
            <p className="mt-1 text-xs text-muted-foreground">Answers use workspace records and HR guidance from the knowledge base.</p>
          </div>
          <AgentCopilot dataMode={mode.toLowerCase()} />
        </section>

        <aside className="space-y-4">
          <section className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">Analysis coverage</h2>
            </div>
            <div className="divide-y divide-border">
              {capabilities.map(({ label, detail }) => (
                <div key={label} className="px-4 py-3">
                  <p className="text-sm font-medium">{label}</p>
                  <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">{detail}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">Usage notes</h2>
            <ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
              <li>Uses current workspace records for factual claims.</li>
              <li>Identifies sample, mixed, and operational data.</li>
              <li>Requires human review for employment decisions.</li>
            </ul>
          </section>
        </aside>
      </div>

      <section>
        <div className="mb-3">
          <h2 className="text-base font-semibold">Employee communication workflows</h2>
          <p className="mt-1 text-xs text-muted-foreground">Prepare a meeting invitation or email from employee directory records. Review and send in Google.</p>
        </div>
        <AgentWorkflows canPrepare={canPrepare} />
      </section>
    </div>
  )
}
