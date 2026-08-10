import { redirect } from "next/navigation"

import { searchParamsFromRecord } from "@/lib/navigation"

export const dynamic = "force-dynamic"

export default async function LegacyHiringPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const query = searchParamsFromRecord(params)
  const target = new URLSearchParams(query)
  target.set("view", "talent")
  redirect(`/onboarding?${target.toString()}`)
}
