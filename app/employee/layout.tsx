import { redirect } from "next/navigation"

import { getRequestActor } from "@/lib/server/request-user"

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const actor = await getRequestActor()
  if (!actor) redirect("/login")
  return children
}
