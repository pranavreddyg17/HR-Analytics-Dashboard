import { redirect } from "next/navigation"
import { env } from "cloudflare:workers"

import { BrandLogo } from "@/components/brand-logo"
import { GoogleSignInButton } from "@/components/google-sign-in-button"
import { getRequestActor } from "@/lib/server/request-user"

const runtime = env as unknown as { GOOGLE_CLIENT_ID?: string }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const actor = await getRequestActor()
  if (actor) redirect("/")
  const denied = (await searchParams).error === "AccessDenied"

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#f4f6f8] px-5 py-12">
      <section className="w-full max-w-[420px] rounded-lg border border-[#dfe4ea] bg-white px-7 py-8 shadow-[0_12px_36px_rgba(23,36,58,0.08)] sm:px-9 sm:py-10">
        <BrandLogo />

        <div className="my-8 border-t border-[#e3e7ec]" />

        <h1 className="text-xl font-semibold tracking-[-0.015em] text-[#17243a]">Sign in</h1>

        {denied && (
          <div role="alert" className="mt-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            This account does not have access. Contact your administrator.
          </div>
        )}

        <div className="mt-6">
          <GoogleSignInButton clientId={runtime.GOOGLE_CLIENT_ID ?? ""} />
        </div>
      </section>
    </main>
  )
}
