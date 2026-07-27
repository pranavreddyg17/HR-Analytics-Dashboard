import { getHealth } from "@/lib/server/runtime"

export async function GET() {
  return Response.json(getHealth())
}
