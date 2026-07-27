import { getModelMetadata } from "@/lib/server/runtime"

export async function GET() {
  return Response.json(getModelMetadata())
}
