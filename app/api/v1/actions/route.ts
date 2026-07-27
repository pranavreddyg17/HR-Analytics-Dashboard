import { getActions } from "@/lib/server/actions"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    return Response.json(await getActions())
  } catch (error) {
    return Response.json(
      { detail: error instanceof Error ? error.message : "Review actions are unavailable." },
      { status: 503 },
    )
  }
}
