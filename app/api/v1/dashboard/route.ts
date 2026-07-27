import { getDashboard } from "@/lib/server/runtime"

export async function GET() {
  return Response.json(getDashboard())
}
