import { redirect } from "next/navigation"

import { searchParamsFromRecord } from "@/lib/navigation"

export const dynamic = "force-dynamic"

export default async function LegacyAiAgentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const query = searchParamsFromRecord({ conversation: params.conversation, returnTo: params.returnTo })
  redirect(`/assistant${query ? `?${query}` : ""}`)
}
