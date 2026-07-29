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
    <main className="grid min-h-dvh bg-[#0b1020] lg:grid-cols-[minmax(0,1.08fr)_minmax(420px,.92fr)]">
      <section className="relative flex min-h-[48vh] flex-col overflow-hidden border-b border-white/10 p-7 text-white sm:p-12 lg:min-h-dvh lg:border-b-0 lg:border-r lg:p-16">
        <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(83,111,144,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(83,111,144,.12)_1px,transparent_1px)] [background-size:72px_72px]" aria-hidden="true" />
        <div className="absolute -right-24 top-1/3 size-80 rounded-full bg-[#35d6a5]/10 blur-3xl" aria-hidden="true" />
        <div className="relative"><BrandLogo /></div>

        <div className="relative my-auto max-w-2xl py-14">
          <div className="mb-5 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.16em] text-[#52e2b7]"><span className="size-1.5 rounded-full bg-[#35d6a5] shadow-[0_0_12px_#35d6a5]" />People operations platform</div>
          <h1 className="max-w-xl text-4xl font-bold leading-[1.05] tracking-[-.055em] text-white sm:text-6xl">Workforce operations, clearly connected.</h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-400">Manage employee work, approvals, analytics, and responsible AI review from one secure workspace.</p>

          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            {modules.map(({ label, detail, icon: Icon }) => (
              <div key={label} className="rounded-xl border border-white/10 bg-white/[.035] p-4 backdrop-blur-sm">
                <Icon className="size-4 text-[#45c6e8]" />
                <p className="mt-4 text-sm font-bold text-slate-100">{label}</p>
                <p className="mt-1 text-[11px] leading-5 text-slate-500">{detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex items-center gap-2 text-[11px] text-slate-500"><ShieldCheck className="size-3.5 text-[#35d6a5]" />Google authentication · Role-based access</div>
      </section>

      <section className="flex items-center justify-center bg-[#f3f6f8] p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="mb-7 flex size-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-[#137b68] shadow-sm"><LockKeyhole className="size-5" /></div>
          <p className="text-[11px] font-bold uppercase tracking-[.14em] text-[#137b68]">Secure workspace</p>
          <h2 className="mt-2 text-3xl font-bold tracking-[-.045em] text-[#101827]">Sign in to continue</h2>
          <p className="mt-2 text-sm leading-6 text-[#627080]">Use the Google account approved by your workspace administrator.</p>

          {denied && <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">This Google account is not on the workspace allowlist. Contact an administrator for access.</div>}

          <form className="mt-7" action={async () => { "use server"; await signIn("google", { redirectTo: "/" }) }}>
            <button className="group flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-[#101827] px-5 text-sm font-bold text-white shadow-[0_10px_28px_rgba(16,24,39,.16)] transition hover:-translate-y-0.5 hover:bg-[#172338] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#35d6a5]">
              <span className="flex size-6 items-center justify-center rounded-md bg-white text-xs font-extrabold text-[#4285f4]">G</span>
              Continue with Google <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          </form>

          <div className="mt-6 border-t border-slate-200 pt-5 text-xs leading-5 text-[#778493]">Access is granted by email and controlled from Admin → Access.</div>
        </div>
      </section>
    </main>
  )
}
