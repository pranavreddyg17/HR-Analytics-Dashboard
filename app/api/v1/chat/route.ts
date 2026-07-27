import { runHrAgent } from "@/lib/server/hr-agent"

export async function POST(request: Request) {
  try {
    const body = await request.json() as { message?: unknown }
    return Response.json(await runHrAgent({ message: body.message }))
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Invalid analytics request."
    return Response.json(
      { detail },
      { status: error instanceof SyntaxError || /message must/.test(detail) ? 422 : 500 },
    )
  }
}
