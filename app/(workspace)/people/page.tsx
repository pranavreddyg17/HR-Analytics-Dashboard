import { PeopleDirectory } from "@/components/people/people-directory"
import { listPeople } from "@/lib/server/people"

export const dynamic = "force-dynamic"

export default async function PeoplePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  const stringParam = (key: string) => typeof params[key] === "string" ? params[key] as string : ""
  const page = Math.max(0, (Number(stringParam("page") || "1") || 1) - 1)
  const query = {
    search: stringParam("q"),
    department: stringParam("department"),
    location: stringParam("location"),
    status: stringParam("status"),
    employmentType: stringParam("employmentType"),
    tenure: stringParam("tenure"),
    includeArchived: stringParam("archived") === "1",
    limit: 25,
    offset: page * 25,
  }
  const [initialData, managerDirectory] = await Promise.all([
    listPeople(query),
    listPeople({ limit: 250 }),
  ])
  return <PeopleDirectory initialData={initialData} initialManagerPool={managerDirectory.items} />
}
