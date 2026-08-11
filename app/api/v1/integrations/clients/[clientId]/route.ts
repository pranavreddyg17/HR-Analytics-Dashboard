import { integrationFailure, revokeIntegrationClient } from "@/lib/server/integration-api"
import { requireAdmin } from "@/lib/server/request-user"

export async function DELETE(request: Request, context: { params: Promise<{ clientId: string }> }) {
  try {
    await requireAdmin(request)
    const { clientId } = await context.params
    return Response.json(await revokeIntegrationClient(clientId))
  } catch (error) { return integrationFailure(error) }
}
