import { Bot, Clock, CheckCircle2, Database, Wrench } from "lucide-react"

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { AgentCopilot } from "@/components/agent-copilot"
import { AgentActionQueue } from "@/components/agent-action-queue"
import { getActions } from "@/lib/server/actions"
import { getDashboard } from "@/lib/server/runtime"

export const dynamic = "force-dynamic"

export default async function AiAgentsPage() {
  const [actions, dashboard] = await Promise.all([getActions(), Promise.resolve(getDashboard())])
  const stats = [
    { label: "MCP tools", value: "9", icon: Wrench },
    { label: "Awaiting approval", value: String(actions.stats.awaitingApproval), icon: Clock },
    { label: "Completed reviews", value: String(actions.stats.completed), icon: CheckCircle2 },
  ]

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3 rounded-xl border border-slate-800 bg-[#0d1424] p-4 text-sm text-slate-300 shadow-sm">
        <Database className="mt-0.5 size-4 shrink-0 text-primary" />
        <div><p className="font-semibold text-white">Grounded analytics mode</p><p className="mt-1 text-xs leading-5 text-slate-400">Nine read-only MCP tools query the active HR dataset. Every answer includes its tool trace and requires human review for employee decisions.</p></div>
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
              <AgentCopilot initialBrief={`I can analyze employees, hiring, attrition, leave, training, promotions, individual profiles, and data quality through nine MCP tools. ${dashboard.dailyBrief}`} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
