import { redirect } from "next/navigation"
import { AccessManager } from "@/components/access-manager"
import { getRequestActor } from "@/lib/server/request-user"

export default async function AccessPage() {
  const actor = await getRequestActor()
  if (actor?.role !== "admin") redirect("/")
  return <AccessManager ownerEmail={actor.email} />
}
