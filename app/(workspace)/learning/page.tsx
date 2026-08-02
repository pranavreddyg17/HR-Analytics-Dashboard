import { redirect } from "next/navigation"

import { searchParamsFromRecord } from "@/lib/navigation"

export const dynamic = "force-dynamic"

export default async function LegacyLearningPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const query = searchParamsFromRecord({ department: params.department, q: params.q, new: params.new, returnTo: params.returnTo })
  redirect(`/courses${query ? `?${query}` : ""}`)
}
