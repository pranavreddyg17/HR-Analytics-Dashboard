import { getPredictionSchema } from "@/lib/server/runtime"

export async function GET() {
  return Response.json(getPredictionSchema())
}
