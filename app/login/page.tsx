import { redirect } from "next/navigation"
import { ArrowRight, BarChart3, Database, LockKeyhole, ShieldCheck, Users } from "lucide-react"

import { auth, signIn } from "@/auth"
import { BrandLogo } from "@/components/brand-logo"

const modules = [
  { label: "People records", detail: "Profiles, teams, and lifecycle history", icon: Users },
  { label: "Workforce analytics", detail: "Hiring, leave, learning, and mobility", icon: BarChart3 },
  { label: "Connected data", detail: "One governed source for HR operations", icon: Database },
]

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await auth()
  if (session?.user?.role) redirect("/")
  const denied = (await searchParams).error === "AccessDenied"

  return (
    <main className="grid min-h-dvh bg-[#f5f7fa] lg:grid-cols-[minmax(0,1fr)_minmax(420px,.72fr)]">
      <section className="flex min-h-[44vh] flex-col border-b border-[#285273] bg-[#0b3155] p-7 text-white sm:p-12 lg:min-h-dvh lg:border-b-0 lg:border-r lg:p-16">
        <BrandLogo />

        <div className="my-auto max-w-2xl py-12">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#9bc9e5]">HR operations workspace</p>
          <h1 className="mt-4 max-w-xl text-4xl font-semibold leading-tight tracking-[-0.03em] text-white sm:text-5xl">Employee administration and workforce reporting</h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-[#bed0df]">Manage people records, workflow approvals, hiring, leave, learning, and analytics from one secure application.</p>

          <div className="mt-10 divide-y divide-white/15 border-y border-white/15">
            {modules.map(({ label, detail, icon: Icon }) => (
              <div key={label} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3 py-4">
                <Icon className="mt-0.5 size-4 text-[#8bc8ec]" />
                <div>
                  <p className="text-sm font-semibold text-white">{label}</p>
                  <p className="mt-1 text-xs leading-5 text-[#a9c0d1]">{detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-[#9bb3c5]"><ShieldCheck className="size-3.5 text-[#8bc8ec]" />Google authentication and role-based access</div>
      </section>

      <section className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="mb-6 flex size-10 items-center justify-center rounded-md border border-[#d9e0e8] bg-white text-[#146aa3]"><LockKeyhole className="size-5" /></div>
          <h2 className="text-3xl font-semibold tracking-[-0.025em] text-[#17243a]">Sign in</h2>
          <p className="mt-2 text-sm leading-6 text-[#637083]">Use a Google account approved by the workspace administrator.</p>

          {denied && <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">This Google account is not on the workspace allowlist. Contact an administrator for access.</div>}

          <form className="mt-7" action={async () => { "use server"; await signIn("google", { redirectTo: "/" }) }}>
            <button className="flex h-12 w-full items-center justify-center gap-3 rounded-md bg-[#146aa3] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#0f5a8d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#146aa3] focus-visible:ring-offset-2">
              <span className="flex size-6 items-center justify-center rounded bg-white text-xs font-bold text-[#4285f4]">G</span>
              Continue with Google <ArrowRight className="size-4" />
            </button>
          </form>

          <div className="mt-6 border-t border-[#d9e0e8] pt-5 text-xs leading-5 text-[#637083]">Account access is managed by email under System → Access.</div>
        </div>
      </section>
    </main>
  )
}
