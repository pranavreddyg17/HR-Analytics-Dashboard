import { AiAssistantWorkspace } from "@/components/ai-assistant-workspace"
import { WorkspaceHeader, WorkspacePage } from "@/components/workspace-ui"
import { getWorkforceAnalytics } from "@/lib/server/hr-analytics"
import { getRequestActor } from "@/lib/server/request-user"

export const dynamic = "force-dynamic"

function workspaceMode(status: Awaited<ReturnType<typeof getWorkforceAnalytics>>["status"]): "Demo" | "Mixed" | "Operational" {
  const modes = new Set(status.filter((item) => item.count > 0).map((item) => item.mode))
  if (modes.size === 1 && modes.has("demo")) return "Demo"
  if (modes.size > 0 && [...modes].every((mode) => mode === "imported")) return "Operational"
  return "Mixed"
}

export default async function AssistantPage() {
  const [analytics, actor] = await Promise.all([getWorkforceAnalytics(), getRequestActor()])
  const mode = workspaceMode(analytics.status)
  const canPrepare = Boolean(actor && ["admin", "hr", "manager"].includes(actor.role))
  return <WorkspacePage><WorkspaceHeader title="AI assistant" description="Ask workforce questions or prepare a reviewed calendar action." /><AiAssistantWorkspace dataMode={mode.toLowerCase()} canPrepare={canPrepare} /></WorkspacePage>
}
