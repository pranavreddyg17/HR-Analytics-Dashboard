"use client"

import { useCallback, useEffect, useState } from "react"
import { Check, Clock3, KeyRound, Loader2, Plus, ShieldCheck, UserRoundCheck } from "lucide-react"

type User = { email: string; display_name: string; role: string; status: string; created_at: string; last_login_at: string | null }
type Audit = { id: string; actor_email: string; action: string; target_email: string; created_at: string }

export function AccessManager({ ownerEmail }: { ownerEmail: string }) {
  const [users, setUsers] = useState<User[]>([])
  const [audit, setAudit] = useState<Audit[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [email, setEmail] = useState("")
  const [role, setRole] = useState("hr")

  const load = useCallback(async () => {
    const response = await fetch("/api/v1/access/users")
    const body = await response.json() as { users?: User[]; audit?: Audit[]; error?: string }
    if (!response.ok) throw new Error(body.error ?? "Could not load access list")
    setUsers(body.users ?? []); setAudit(body.audit ?? [])
  }, [])
  useEffect(() => {
    let active = true
    fetch("/api/v1/access/users").then(async (response) => {
      const body = await response.json() as { users?: User[]; audit?: Audit[]; error?: string }
      if (!response.ok) throw new Error(body.error ?? "Could not load access list")
      if (active) { setUsers(body.users ?? []); setAudit(body.audit ?? []) }
    }).catch((error) => { if (active) setMessage(error instanceof Error ? error.message : "Could not load access list") })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  async function invite(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setMessage("")
    try {
      const response = await fetch("/api/v1/access/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, role }) })
      const body = await response.json() as { error?: string }
      if (!response.ok) throw new Error(body.error ?? "Could not add email")
      setEmail(""); setMessage("Access granted. They can now sign in with Google."); await load()
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not add email") } finally { setSaving(false) }
  }
  async function update(user: User, changes: { role?: string; status?: string }) {
    setMessage("")
    const response = await fetch(`/api/v1/access/users/${encodeURIComponent(user.email)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(changes) })
    const body = await response.json() as { error?: string }
    if (!response.ok) { setMessage(body.error ?? "Could not update access"); return }
    await load()
  }

  return <div className="page-stack">
    <section className="surface-card overflow-hidden">
      <div className="grid gap-8 p-6 lg:grid-cols-[1fr_.78fr] lg:p-8">
        <div><div className="eyebrow"><ShieldCheck className="size-3.5" /> Workspace security</div><h1 className="mt-3 text-3xl font-semibold tracking-[-.04em]">Google access, managed here.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Add an email, choose what they can do, and they can sign in immediately. Disabled accounts lose access when their current session expires.</p></div>
        <form onSubmit={invite} className="rounded-2xl border border-border bg-muted/35 p-4">
          <label className="text-xs font-semibold text-muted-foreground">Allow a Google account</label>
          <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/25" />
          <div className="mt-2 flex gap-2"><select value={role} onChange={(event) => setRole(event.target.value)} className="h-10 flex-1 rounded-xl border border-border bg-background px-3 text-sm"><option value="hr">HR</option><option value="manager">Manager</option><option value="viewer">Viewer</option><option value="admin">Admin</option></select><button disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">{saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add</button></div>
        </form>
      </div>
      {message && <div className="border-t border-border bg-primary/[.04] px-6 py-3 text-sm text-foreground">{message}</div>}
    </section>

    <section className="surface-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 className="font-semibold">People with access</h2><p className="text-xs text-muted-foreground">{users.length} approved Google {users.length === 1 ? "account" : "accounts"}</p></div><UserRoundCheck className="size-5 text-primary" /></div>
      {loading ? <div className="flex h-40 items-center justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div> : <div className="divide-y divide-border">
        {users.map((user) => <div key={user.email} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1fr)_140px_130px] md:items-center">
          <div className="min-w-0"><p className="truncate text-sm font-semibold">{user.display_name || user.email.split("@")[0]} {user.email === ownerEmail && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">You</span>}</p><p className="truncate text-xs text-muted-foreground">{user.email} · {user.last_login_at ? `Last signed in ${new Date(user.last_login_at).toLocaleDateString()}` : "Not signed in yet"}</p></div>
          <select aria-label={`Role for ${user.email}`} value={user.role} disabled={user.email === ownerEmail} onChange={(event) => update(user, { role: event.target.value })} className="h-9 rounded-lg border border-border bg-background px-2 text-sm disabled:opacity-60"><option value="admin">Admin</option><option value="hr">HR</option><option value="manager">Manager</option><option value="viewer">Viewer</option></select>
          <button disabled={user.email === ownerEmail} onClick={() => update(user, { status: user.status === "active" ? "disabled" : "active" })} className={`inline-flex h-9 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-semibold disabled:opacity-50 ${user.status === "active" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-border bg-muted text-muted-foreground"}`}>{user.status === "active" ? <><Check className="size-3.5" /> Active</> : "Disabled"}</button>
        </div>)}
      </div>}
    </section>

    <section className="surface-card"><div className="flex items-center gap-2 border-b border-border px-5 py-4"><Clock3 className="size-4 text-muted-foreground" /><h2 className="font-semibold">Recent access changes</h2></div><div className="divide-y divide-border">{audit.length ? audit.slice(0, 12).map((item) => <div key={item.id} className="flex items-center gap-3 px-5 py-3 text-xs"><KeyRound className="size-4 text-primary" /><span className="min-w-0 flex-1 truncate"><b>{item.actor_email}</b> {item.action.replaceAll("_", " ")} for <b>{item.target_email}</b></span><time className="text-muted-foreground">{new Date(item.created_at).toLocaleString()}</time></div>) : <p className="px-5 py-8 text-center text-sm text-muted-foreground">New access changes will appear here.</p>}</div></section>
  </div>
}
