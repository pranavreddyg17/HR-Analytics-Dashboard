import { redirect } from "next/navigation"

import { searchParamsFromRecord } from "@/lib/navigation"

export const dynamic = "force-dynamic"

export default async function LegacyDataPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const query = searchParamsFromRecord({ domain: params.domain, returnTo: params.returnTo })
  redirect(`/imports${query ? `?${query}` : ""}`)
}
