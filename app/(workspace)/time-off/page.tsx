import { redirect } from "next/navigation"

import { searchParamsFromRecord } from "@/lib/navigation"

export const dynamic = "force-dynamic"

export default async function LegacyTimeOffPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const query = searchParamsFromRecord({ from: params.from, to: params.to, department: params.department, location: params.location, leaveType: params.leaveType, request: params.request, returnTo: params.returnTo })
  redirect(`/leaves${query ? `?${query}` : ""}`)
}
