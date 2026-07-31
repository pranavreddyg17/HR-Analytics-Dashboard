import { redirect } from "next/navigation"

import { AppShell } from "@/components/app-shell"
import { getRequestActor } from "@/lib/server/request-user"

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const actor = await getRequestActor()
  if (!actor) redirect("/login")
  return <AppShell user={{ displayName: actor.displayName, email: actor.email, authenticated: !actor.localPreview, role: actor.role }}>{children}</AppShell>
}
