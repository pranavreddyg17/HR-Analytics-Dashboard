import type { RiskLevel } from "@/lib/types"
import { getEmployees } from "@/lib/server/runtime"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const risk = url.searchParams.get("risk") ?? "all"
  const search = url.searchParams.get("search") ?? ""
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "2000", 10)
  const offset = Number.parseInt(url.searchParams.get("offset") ?? "0", 10)
  if (!["all", "high", "medium", "low"].includes(risk)) {
    return Response.json({ detail: "risk must be all, high, medium, or low." }, { status: 422 })
  }
  if (search.length > 100 || !Number.isInteger(limit) || limit < 1 || limit > 5000 || !Number.isInteger(offset) || offset < 0) {
    return Response.json({ detail: "Invalid employees query." }, { status: 422 })
  }
  return Response.json(getEmployees({ risk: risk as RiskLevel | "all", search, limit, offset }))
}
