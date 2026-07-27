import { predict, RequestValidationError } from "@/lib/server/runtime"

export async function POST(request: Request) {
  try {
    return Response.json(predict(await request.json()))
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Invalid prediction request."
    return Response.json(
      { detail },
      { status: error instanceof RequestValidationError || error instanceof SyntaxError ? 422 : 500 },
    )
  }
}
