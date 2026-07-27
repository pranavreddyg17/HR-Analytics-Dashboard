import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { AccessManager } from "@/components/access-manager"

export default async function AccessPage() {
  const session = await auth()
  if (session?.user?.role !== "admin") redirect("/")
  return <AccessManager ownerEmail={session.user.email ?? ""} />
}
