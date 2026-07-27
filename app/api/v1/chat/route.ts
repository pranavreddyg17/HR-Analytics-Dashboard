import { answerAnalytics, RequestValidationError } from "@/lib/server/runtime"

export async function POST(request: Request) {
  try {
    const body = await request.json() as { message?: unknown }
    return Response.json(answerAnalytics(body.message))
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Invalid analytics request."
    return Response.json(
      { detail },
      { status: error instanceof RequestValidationError || error instanceof SyntaxError ? 422 : 500 },
    )
  }
}
