import { PeopleProfile } from "@/components/people/people-profile"

export const dynamic = "force-dynamic"

export default async function PersonPage({ params, searchParams }: { params: Promise<{ employeeId: string }>; searchParams: Promise<{ returnTo?: string }> }) {
  const { employeeId } = await params
  const { returnTo } = await searchParams
  return <PeopleProfile employeeId={employeeId} returnTo={returnTo} />
}
