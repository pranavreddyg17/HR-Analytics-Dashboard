import { Bot, Zap, Clock, CheckCircle2, Database, Wrench } from "lucide-react"

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { AgentCopilot } from "@/components/agent-copilot"
import { AgentActionQueue } from "@/components/agent-action-queue"
import { getActions } from "@/lib/server/actions"
import { getDashboard } from "@/lib/server/runtime"

export const dynamic = "force-dynamic"

export default async function AiAgentsPage() {
  const [actions, dashboard] = await Promise.all([getActions(), Promise.resolve(getDashboard())])
  const stats = [
    { label: "MCP tools", value: "8", icon: Wrench },
    { label: "Awaiting approval", value: String(actions.stats.awaitingApproval), icon: Clock },
    { label: "Completed reviews", value: String(actions.stats.completed), icon: CheckCircle2 },
  ]

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
        <Database className="mt-0.5 size-4 shrink-0 text-primary" />
        <p>
          LangChain loads eight read-only tools from LaidbackHR.AI&apos;s Streamable HTTP MCP server. Every answer shows its tool trace, stays grounded in the filtered D1 warehouse, and keeps employee-level decisions under human control.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_400px]">
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-3 gap-4">
            {stats.map((stat) => (
              <Card key={stat.label} className="gap-2 p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <stat.icon className="size-4" />
                  <span className="truncate text-xs font-medium">{stat.label}</span>
                </div>
                <span className="font-mono text-2xl font-semibold tabular-nums">{stat.value}</span>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader className="border-b">
              <CardTitle>Data-driven review queue</CardTitle>
              <CardDescription>
                Suggested reviews derived from workforce and model cohorts; approvals are stored durably
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AgentActionQueue initialActions={actions.items} />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card className="flex h-[620px] flex-col">
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2">
                <Bot className="size-4 text-primary" />
                Analytics copilot
              </CardTitle>
              <CardDescription>LangChain + MCP tools · deterministic private synthesis by default</CardDescription>
            </CardHeader>
            <CardContent className="min-h-0 flex-1">
              <AgentCopilot initialBrief={`I can analyze hiring, attrition, leave, training, promotions, employee drill-downs, and data quality through eight MCP tools. ${dashboard.dailyBrief}`} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
