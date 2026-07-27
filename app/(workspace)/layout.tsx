import { redirect } from "next/navigation"

import { auth } from "@/auth"
import { AppShell } from "@/components/app-shell"

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user?.email || !session.user.role) redirect("/login")
  return <AppShell user={{ displayName: session.user.name ?? session.user.email.split("@")[0], email: session.user.email, authenticated: true, role: session.user.role }}>{children}</AppShell>
}
