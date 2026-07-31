import { redirect } from "next/navigation"
import { env } from "cloudflare:workers"

import { BrandLogo } from "@/components/brand-logo"
import { GoogleSignInButton } from "@/components/google-sign-in-button"
import { getRequestActor } from "@/lib/server/request-user"

const runtime = env as unknown as { GOOGLE_CLIENT_ID?: string }

const modules = [
  { label: "People records", detail: "Profiles, teams, and employment history" },
  { label: "Workforce reporting", detail: "Hiring, leave, learning, and mobility" },
  { label: "Data management", detail: "Imports, source coverage, and reporting feeds" },
]

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const actor = await getRequestActor()
  if (actor) redirect("/")
  const denied = (await searchParams).error === "AccessDenied"

  return (
    <main className="grid min-h-dvh bg-[#f5f7fa] lg:grid-cols-[minmax(0,1fr)_minmax(420px,.72fr)]">
      <section className="flex min-h-[44vh] flex-col border-b border-[#285273] bg-[#0b3155] p-7 text-white sm:p-12 lg:min-h-dvh lg:border-b-0 lg:border-r lg:p-16">
        <BrandLogo />

        <div className="my-auto max-w-2xl py-12">
          <p className="text-xs font-medium text-[#9bc9e5]">HR operations</p>
          <h1 className="mt-4 max-w-xl text-4xl font-semibold leading-tight tracking-tight text-white">Employee administration and workforce reporting</h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-[#bed0df]">Manage people records, workflow approvals, hiring, leave, learning, and analytics from one secure application.</p>

          <div className="mt-10 divide-y divide-white/15 border-y border-white/15">
            {modules.map(({ label, detail }) => (
              <div key={label} className="py-4">
                <div>
                  <p className="text-sm font-semibold text-white">{label}</p>
                  <p className="mt-1 text-xs leading-5 text-[#a9c0d1]">{detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="text-xs text-[#9bb3c5]">Google authentication · Role-based access</div>
      </section>

      <section className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <h2 className="text-3xl font-semibold tracking-[-0.025em] text-[#17243a]">Sign in</h2>
          <p className="mt-2 text-sm leading-6 text-[#637083]">Use a Google account approved by the workspace administrator.</p>

          {denied && <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">This Google account is not on the workspace allowlist. Contact an administrator for access.</div>}

          <div className="mt-7"><GoogleSignInButton clientId={runtime.GOOGLE_CLIENT_ID ?? ""} /></div>

          <div className="mt-6 border-t border-[#d9e0e8] pt-5 text-xs leading-5 text-[#637083]">Account access is managed under Administration / Access.</div>
        </div>
      </section>
    </main>
  )
}
