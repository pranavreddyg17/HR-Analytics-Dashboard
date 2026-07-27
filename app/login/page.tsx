import { redirect } from "next/navigation"
import { ArrowRight, CheckCircle2, LockKeyhole, Sparkles } from "lucide-react"

import { auth, signIn } from "@/auth"
import { BrandLogo } from "@/components/brand-logo"

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await auth()
  if (session?.user?.role) redirect("/")
  const denied = (await searchParams).error === "AccessDenied"
  return (
    <main className="relative grid min-h-dvh overflow-hidden bg-[#f4f6ef] lg:grid-cols-[1.08fr_.92fr]">
      <div className="pointer-events-none absolute -left-32 -top-40 size-[34rem] rounded-full bg-[#cfe7d7]/55 blur-3xl" />
      <section className="relative flex min-h-[44vh] flex-col justify-between p-7 sm:p-12 lg:min-h-dvh lg:p-16">
        <BrandLogo />
        <div className="max-w-2xl py-14 lg:py-0">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#2f6b4f]/15 bg-white/65 px-3 py-1.5 text-xs font-semibold text-[#2f6b4f]"><Sparkles className="size-3.5" /> Calm people operations</div>
          <h1 className="font-serif text-5xl leading-[.98] tracking-[-.045em] text-[#17362a] sm:text-7xl">Your people data,<br /><span className="italic text-[#477e63]">finally useful.</span></h1>
          <p className="mt-7 max-w-xl text-base leading-7 text-[#53635b] sm:text-lg">Manage employees, approvals, workforce signals, and responsible AI analysis in one focused workspace.</p>
          <div className="mt-9 grid max-w-xl gap-3 sm:grid-cols-3">
            {["One employee record", "Explainable insights", "Human-led decisions"].map((item) => <div key={item} className="flex items-center gap-2 text-sm font-medium text-[#365347]"><CheckCircle2 className="size-4 text-[#5e9677]" />{item}</div>)}
          </div>
        </div>
        <p className="text-xs text-[#75847c]">LaidbackHR.AI · Private HR workspace</p>
      </section>
      <section className="relative flex items-center justify-center border-t border-black/5 bg-white/55 p-6 backdrop-blur-xl lg:border-l lg:border-t-0">
        <div className="w-full max-w-md rounded-[2rem] border border-black/[.07] bg-white p-7 shadow-[0_30px_100px_rgba(23,54,42,.12)] sm:p-10">
          <div className="mb-8 flex size-12 items-center justify-center rounded-2xl bg-[#e9f3ec] text-[#2f6b4f]"><LockKeyhole className="size-5" /></div>
          <h2 className="text-3xl font-semibold tracking-[-.035em] text-[#17362a]">Welcome back</h2>
          <p className="mt-2 text-sm leading-6 text-[#68776f]">Sign in with an approved Google account to enter your HR workspace.</p>
          {denied && <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">That email is not on this workspace’s allowlist. Ask your LaidbackHR.AI administrator to add it.</div>}
          <form className="mt-7" action={async () => { "use server"; await signIn("google", { redirectTo: "/" }) }}>
            <button className="group flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-[#17362a] px-5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-[#244c3b] hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#477e63]">
              <svg className="size-5" viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M21.35 12.2c0-.7-.06-1.2-.2-1.72H12v3.31h5.37a4.6 4.6 0 0 1-2 3.02l-.02.11 2.9 2.25.2.02c1.83-1.7 2.9-4.18 2.9-6.99Z"/><path fill="#fff" opacity=".85" d="M12 21.7c2.62 0 4.82-.86 6.43-2.51l-3.06-2.38c-.82.55-1.92.94-3.37.94a5.85 5.85 0 0 1-5.54-4.04l-.11.01-3.02 2.34-.04.1A9.7 9.7 0 0 0 12 21.7Z"/><path fill="#fff" opacity=".7" d="M6.46 13.71A5.98 5.98 0 0 1 6.14 12c0-.6.1-1.18.3-1.72v-.12L3.4 7.78l-.1.05A9.7 9.7 0 0 0 2.3 12c0 1.5.36 2.92.99 4.17l3.17-2.46Z"/><path fill="#fff" opacity=".9" d="M12 6.25c1.82 0 3.05.79 3.76 1.44l2.74-2.67A9.32 9.32 0 0 0 12 2.3a9.7 9.7 0 0 0-8.71 5.53l3.15 2.45A5.87 5.87 0 0 1 12 6.25Z"/></svg>
              Continue with Google <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
            </button>
          </form>
          <p className="mt-5 text-center text-xs leading-5 text-[#829087]">Access is limited to emails approved by your workspace administrator.</p>
        </div>
      </section>
    </main>
  )
}
