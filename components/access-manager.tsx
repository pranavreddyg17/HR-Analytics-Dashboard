"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

import { formatWorkspaceDateTime } from "@/lib/date-format"
import { WorkspaceHeader, WorkspacePage } from "@/components/workspace-ui"

type User = { email: string; display_name: string; role: string; status: string; created_at: string; last_login_at: string | null; identity_providers?: Array<"google" | "microsoft"> }
type Audit = { id: string; actor_email: string; action: string; target_email: string; created_at: string }

export function AccessManager({ ownerEmail }: { ownerEmail: string }) {
  const [users, setUsers] = useState<User[]>([])
  const [audit, setAudit] = useState<Audit[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [email, setEmail] = useState("")
  const [role, setRole] = useState("hr")
  const [removeTarget, setRemoveTarget] = useState<User | null>(null)
  const [removing, setRemoving] = useState(false)

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
      setEmail(""); setMessage("Access granted. They can now sign in with Google or Microsoft."); await load()
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not add email") } finally { setSaving(false) }
  }
  async function update(user: User, changes: { role?: string; status?: string }) {
    setMessage("")
    const response = await fetch(`/api/v1/access/users/${encodeURIComponent(user.email)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(changes) })
    const body = await response.json() as { error?: string }
    if (!response.ok) { setMessage(body.error ?? "Could not update access"); return }
    await load()
  }
  async function remove() {
    if (!removeTarget) return
    setRemoving(true); setMessage("")
    const response = await fetch(`/api/v1/access/users/${encodeURIComponent(removeTarget.email)}`, { method: "DELETE" })
    const body = await response.json() as { error?: string }
    if (!response.ok) { setMessage(body.error ?? "Could not remove access"); setRemoving(false); return }
    setMessage(`${removeTarget.email} no longer has access.`); setRemoveTarget(null); setRemoving(false); await load()
  }

  return (
    <WorkspacePage>
      <WorkspaceHeader title="Access" description="Accounts and permissions." meta={<>{users.length} approved {users.length === 1 ? "account" : "accounts"}</>} />

      <section className="surface-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Add account</h2>
          <p className="mt-1 text-xs text-muted-foreground">Grant access by verified Google or Microsoft email address.</p>
        </div>
        <form onSubmit={invite} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_160px_auto] sm:items-end">
          <label className="text-xs font-semibold text-foreground">
            Email address
            <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/25" />
          </label>
          <label className="text-xs font-semibold text-foreground">
            Role
            <select value={role} onChange={(event) => setRole(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-border bg-background px-3 text-sm">
              <option value="hr">HR</option>
              <option value="manager">Manager</option>
              <option value="employee">Employee</option>
              <option value="viewer">Viewer</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <button type="submit" disabled={saving} className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {saving && <Loader2 className="size-4 animate-spin" />}
            Add account
          </button>
        </form>
        {message && <div className="border-t border-border bg-muted/35 px-5 py-3 text-sm text-foreground">{message}</div>}
      </section>

      <section className="surface-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Accounts</h2>
          <p className="mt-1 text-xs text-muted-foreground">{users.length} approved {users.length === 1 ? "account" : "accounts"}</p>
        </div>
        {loading ? (
          <div className="flex h-40 items-center justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="divide-y divide-border">
            {users.map((user) => (
              <div key={user.email} className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_140px_120px_76px] md:items-center">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {user.display_name || user.email.split("@")[0]}
                    {user.email === ownerEmail && <span className="ml-2 text-meta font-semibold text-muted-foreground">Current user</span>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {user.email} · {user.identity_providers?.length ? user.identity_providers.map((provider) => provider === "microsoft" ? "Microsoft" : "Google").join(" + ") : "No linked sign-in"} · {user.last_login_at ? `Last sign-in ${new Date(user.last_login_at).toLocaleDateString()}` : "No sign-in recorded"}
                  </p>
                </div>
                <select aria-label={`Role for ${user.email}`} value={user.role} disabled={user.email === ownerEmail} onChange={(event) => update(user, { role: event.target.value })} className="h-9 rounded-md border border-border bg-background px-2 text-sm disabled:opacity-60">
                  <option value="admin">Admin</option>
                  <option value="hr">HR</option>
                  <option value="manager">Manager</option>
                  <option value="employee">Employee</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button type="button" disabled={user.email === ownerEmail} onClick={() => update(user, { status: user.status === "active" ? "disabled" : "active" })} className="h-9 rounded-md border border-border bg-background px-3 text-xs font-semibold capitalize disabled:opacity-50">
                  {user.status}
                </button>
                <button type="button" disabled={user.email === ownerEmail} onClick={() => setRemoveTarget(user)} className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-muted-foreground hover:bg-muted hover:text-destructive disabled:cursor-not-allowed disabled:opacity-30" aria-label={`Remove ${user.email}`} title={user.email === ownerEmail ? "The workspace owner cannot be removed" : "Remove access"}>Remove</button>
              </div>
            ))}
          </div>
        )}
      </section>

      <details className="surface-card overflow-hidden">
        <summary className="flex min-h-12 items-center justify-between px-4 font-semibold">Access history <span className="text-meta font-normal text-muted-foreground">{audit.length} recorded changes</span></summary>
        <div className="divide-y divide-border border-t border-border">
          {audit.length ? audit.slice(0, 12).map((item) => (
            <div key={item.id} className="grid gap-1 px-5 py-3 text-xs sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <span className="min-w-0 truncate"><b>{item.actor_email}</b> {item.action.replaceAll("_", " ")} for <b>{item.target_email}</b></span>
              <time className="text-muted-foreground">{formatWorkspaceDateTime(item.created_at)}</time>
            </div>
          )) : <p className="px-5 py-8 text-center text-sm text-muted-foreground">No access changes recorded.</p>}
        </div>
      </details>

      {removeTarget && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-foreground/25 p-4" role="dialog" aria-modal="true" aria-labelledby="remove-access-title">
          <div className="w-full max-w-md rounded-lg border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="remove-access-title" className="text-lg font-semibold">Remove access?</h2>
                <p className="mt-1 text-sm text-muted-foreground"><b className="text-foreground">{removeTarget.email}</b> will no longer be able to sign in.</p>
              </div>
              <button type="button" onClick={() => setRemoveTarget(null)} className="text-button shrink-0" aria-label="Cancel removal">Close</button>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setRemoveTarget(null)} className="h-10 rounded-md border border-border px-4 text-sm font-semibold">Cancel</button>
              <button type="button" onClick={remove} disabled={removing} className="inline-flex h-10 items-center gap-2 rounded-md bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                {removing && <Loader2 className="size-4 animate-spin" />}
                Remove account
              </button>
            </div>
          </div>
        </div>
      )}
    </WorkspacePage>
  )
}
