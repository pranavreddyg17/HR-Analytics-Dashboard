import { createIntegrationClient, integrationFailure, listIntegrationClients } from "@/lib/server/integration-api"
import { requireAdmin } from "@/lib/server/request-user"

export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    return Response.json({ clients: await listIntegrationClients() })
  } catch (error) { return integrationFailure(error) }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAdmin(request)
    return Response.json(await createIntegrationClient(await request.json(), actor), { status: 201 })
  } catch (error) { return integrationFailure(error) }
}
