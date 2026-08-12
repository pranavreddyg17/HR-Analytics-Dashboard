import { redirect } from "next/navigation"

import { GoogleSignInButton } from "@/components/google-sign-in-button"
import { MicrosoftSignInButton } from "@/components/microsoft-sign-in-button"
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

  return (
    <main className="login-shell flex min-h-dvh items-center justify-center px-5 py-12">
      <section className="login-card w-full max-w-[420px] px-7 py-8 sm:px-9 sm:py-10">
        <p className="text-[15px] font-semibold leading-[22px]">LaidbackHR.ai</p>

        <div className="my-8 border-t border-border" />

        <h1 className="text-xl font-semibold">Sign in</h1>

        {signedOut && (
          <div role="status" className="mt-5 rounded-md border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
            You have signed out.
          </div>
        )}

        {denied && (
          <div role="alert" className="mt-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            This account does not have access. Contact your administrator.
          </div>
        )}

        {authError && (
          <div role="alert" className="mt-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Sign-in could not be completed. Retry or contact your administrator.
          </div>
        )}

        <div className="mt-6 space-y-4">
          <GoogleSignInButton clientId={runtime.GOOGLE_CLIENT_ID ?? ""} />
          <div className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden="true">
            <span className="h-px flex-1 bg-border" />
            <span>or</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <MicrosoftSignInButton configured={microsoftConfigured} />
        </div>
      </section>
    </main>
  )
}
