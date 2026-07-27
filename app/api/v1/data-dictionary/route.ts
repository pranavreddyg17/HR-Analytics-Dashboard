import { getDataDictionary } from "@/lib/server/runtime"

export async function GET() {
  return Response.json(getDataDictionary())
}
