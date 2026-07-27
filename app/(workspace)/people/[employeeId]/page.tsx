import { PeopleProfile } from "@/components/people/people-profile"

export const dynamic = "force-dynamic"

export default async function PersonPage({ params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await params
  return <PeopleProfile employeeId={employeeId} />
}
