import { Bot, Zap, Clock, CheckCircle2 } from "lucide-react"

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { AgentCopilot } from "@/components/agent-copilot"
import { AgentActionQueue } from "@/components/agent-action-queue"

const agents = [
  { name: "Retention Agent", status: "Active", runs: 42 },
  { name: "Scheduling Agent", status: "Active", runs: 18 },
  { name: "Mobility Agent", status: "Active", runs: 11 },
  { name: "Reporting Agent", status: "Idle", runs: 7 },
  { name: "Insights Agent", status: "Active", runs: 29 },
]

const stats = [
  { label: "Actions this week", value: "107", icon: Zap },
  { label: "Awaiting approval", value: "2", icon: Clock },
  { label: "Auto-completed", value: "89", icon: CheckCircle2 },
]

export default function AiAgentsPage() {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_400px]">
        {/* Left: action queue */}
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-3 gap-4">
            {stats.map((s) => (
              <Card key={s.label} className="gap-2 p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <s.icon className="size-4" />
                  <span className="truncate text-xs font-medium">{s.label}</span>
                </div>
                <span className="font-mono text-2xl font-semibold tabular-nums">{s.value}</span>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader className="border-b">
              <CardTitle>Automated action queue</CardTitle>
              <CardDescription>
                Agents draft and execute retention work — high-impact actions pause for your approval
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AgentActionQueue />
            </CardContent>
          </Card>
        </div>

        {/* Right: copilot + agent roster */}
        <div className="flex flex-col gap-5">
          <Card className="flex h-[520px] flex-col">
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-md bg-primary/15 text-primary">
                  <Bot className="size-3.5" />
                </span>
                People Copilot
              </CardTitle>
              <CardDescription>Ask questions or trigger agents in natural language</CardDescription>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col">
              <AgentCopilot />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Agent roster</CardTitle>
              <CardDescription>Autonomous workers on your team</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {agents.map((a) => (
                <div key={a.name} className="flex items-center gap-3 rounded-lg bg-muted/40 p-2.5">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <Bot className="size-4" />
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{a.name}</p>
                    <p className="text-xs text-muted-foreground">{a.runs} runs this month</p>
                  </div>
                  <span
                    className={
                      a.status === "Active"
                        ? "flex items-center gap-1 text-xs font-medium text-success"
                        : "flex items-center gap-1 text-xs font-medium text-muted-foreground"
                    }
                  >
                    <span
                      className={
                        a.status === "Active"
                          ? "size-1.5 rounded-full bg-success"
                          : "size-1.5 rounded-full bg-muted-foreground"
                      }
                    />
                    {a.status}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
