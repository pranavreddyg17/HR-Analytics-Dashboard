import { redirect } from "next/navigation"

import { SignInExperience } from "@/components/auth/sign-in-experience"
import { getRequestActor } from "@/lib/server/request-user"
import { runtimeEnv } from "@/lib/server/runtime-env"

const runtime = runtimeEnv as {
  GOOGLE_CLIENT_ID?: string
  MICROSOFT_ENTRA_ENABLED?: string
  MICROSOFT_ENTRA_CLIENT_ID?: string
  MICROSOFT_ENTRA_CLIENT_SECRET?: string
  MICROSOFT_ENTRA_TENANT_ID?: string
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; signedOut?: string }> }) {
  const actor = await getRequestActor()
  if (actor) redirect("/")
  const query = await searchParams
  const denied = query.error === "AccessDenied"
  const authError = Boolean(query.error && !denied)
  const signedOut = query.signedOut === "1"
  const microsoftConfigured = runtime.MICROSOFT_ENTRA_ENABLED === "true"
    && Boolean(runtime.MICROSOFT_ENTRA_CLIENT_ID && runtime.MICROSOFT_ENTRA_CLIENT_SECRET && runtime.MICROSOFT_ENTRA_TENANT_ID)

  return <SignInExperience
    googleClientId={runtime.GOOGLE_CLIENT_ID ?? ""}
    microsoftConfigured={microsoftConfigured}
    denied={denied}
    authError={authError}
    signedOut={signedOut}
  />
}
