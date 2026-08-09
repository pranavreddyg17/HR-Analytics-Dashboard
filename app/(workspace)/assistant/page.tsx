import { AiAssistantWorkspace } from "@/components/ai-assistant-workspace"
import { WorkspaceHeader, WorkspacePage } from "@/components/workspace-ui"
import { getWorkspaceDomainStatus } from "@/lib/server/hr-analytics"
import { getRequestActor } from "@/lib/server/request-user"

export const dynamic = "force-dynamic"

function workspaceMode(status: Awaited<ReturnType<typeof getWorkspaceDomainStatus>>): "Demo" | "Mixed" | "Operational" {
  const modes = new Set(status.filter((item) => item.count > 0).map((item) => item.mode))
  if (modes.size === 1 && modes.has("demo")) return "Demo"
  if (modes.size > 0 && [...modes].every((mode) => mode === "imported")) return "Operational"
  return "Mixed"
}

export default async function AssistantPage() {
  const [status, actor] = await Promise.all([getWorkspaceDomainStatus(), getRequestActor()])
  const mode = workspaceMode(status)
  const canPrepare = Boolean(actor && ["admin", "hr", "manager"].includes(actor.role))
  return <WorkspacePage><WorkspaceHeader title="AI assistant" description="Workforce analysis and governed HR workflows." /><AiAssistantWorkspace dataMode={mode.toLowerCase()} canPrepare={canPrepare} /></WorkspacePage>
}
