"use client"

import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { RegisterPagination } from "@/components/register-pagination"
import { formatWorkspaceDateTime } from "@/lib/date-format"

type ApiClient = {
  id: string
  name: string
  keyPrefix: string
  scopes: string[]
  status: string
  expiresAt: string
  lastUsedAt: string | null
}

const availableScopes = [
  { value: "analytics:read", label: "Workforce analytics" },
  { value: "people:read", label: "Employee directory" },
  { value: "retention:read", label: "Retention intelligence" },
  { value: "model:invoke", label: "Retention model scenarios" },
  { value: "operations:read", label: "Operational queues" },
  { value: "assistant:use", label: "AI assistant conversations" },
  { value: "agent:invoke", label: "Read-only agents" },
  { value: "workflows:read", label: "Workflow status" },
  { value: "workflows:write", label: "Governed workflow execution" },
  { value: "data:write", label: "Data imports" },
]

const endpoints = [
  ["GET", "/api/v1/integrations/v1/capabilities", "Discover supported endpoints, scopes, and agents"],
  ["GET", "/api/v1/integrations/v1/workforce", "Workforce and decision-support measures"],
  ["GET", "/api/v1/integrations/v1/insights?view={view}", "Overview, workforce impact, talent supply, or capability projections"],
  ["GET", "/api/v1/integrations/v1/people", "Paginated employee directory"],
  ["GET", "/api/v1/integrations/v1/people/{employeeId}", "Minimum employee profile and operational counts"],
  ["GET", "/api/v1/integrations/v1/retention", "Retention cohorts and governed review state"],
  ["GET", "/api/v1/integrations/v1/retention/evidence", "Operational retention evidence from current HR records"],
  ["GET", "/api/v1/integrations/v1/retention/model", "Model metadata, input contract, and intended-use controls"],
  ["POST", "/api/v1/integrations/v1/retention/predict", "Explainable historical-model scenario assessment"],
  ["GET", "/api/v1/integrations/v1/operations", "Onboarding, leave, learning, and work queues"],
  ["GET", "/api/v1/integrations/v1/onboarding", "Onboarding readiness and employee handoffs"],
  ["GET", "/api/v1/integrations/v1/recruiting", "Requisitions and candidate pipeline"],
  ["GET", "/api/v1/integrations/v1/leave", "Filtered leave register and coverage"],
  ["GET", "/api/v1/integrations/v1/learning", "Assignments and capability recommendations"],
  ["GET", "/api/v1/integrations/v1/work-items", "Paginated operational work queue"],
  ["GET", "/api/v1/integrations/v1/work-items/priority-policy", "Versioned work-priority factors and controls"],
  ["GET", "/api/v1/integrations/v1/exits", "Confirmed exits, offboarding progress, asset recovery, and access removal"],
  ["GET", "/api/v1/integrations/v1/assets", "Equipment inventory, custody, condition, warranty, and lifecycle"],
  ["POST", "/api/v1/integrations/v1/agents/{agentId}/invoke", "Grounded read-only agent invocation"],
  ["GET/POST", "/api/v1/integrations/v1/assistant/conversations", "Stateful AI assistant conversations"],
  ["POST", "/api/v1/integrations/v1/assistant/conversations/{id}/messages", "Continue an assistant conversation"],
  ["GET/POST", "/api/v1/integrations/v1/workflows", "Read or create reviewed workflow drafts"],
  ["POST", "/api/v1/integrations/v1/workflows/plan", "Plan a workflow from a natural-language objective"],
  ["POST", "/api/v1/integrations/v1/workflows/{id}/execute", "Confirm and execute an idempotent internal workflow"],
  ["POST", "/api/v1/integrations/v1/workflows/requests", "Create a governed leave or hiring request"],
  ["POST", "/api/v1/integrations/v1/data/import", "Validate or apply domain records"],
]

export function IntegrationApiManager({ canManage }: { canManage: boolean }) {
  const [clients, setClients] = useState<ApiClient[]>([])
  const [name, setName] = useState("")
  const [scopes, setScopes] = useState(["analytics:read", "people:read", "retention:read", "model:invoke", "operations:read", "assistant:use", "agent:invoke", "workflows:read"])
  const [apiKey, setApiKey] = useState("")
  const [pendingRevoke, setPendingRevoke] = useState<ApiClient | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")

  async function refresh() {
    if (!canManage) return
    const response = await fetch("/api/v1/integrations/clients", { cache: "no-store" })
    const body = await response.json() as { clients?: ApiClient[]; error?: { message?: string } }
    if (!response.ok) throw new Error(body.error?.message ?? "API clients could not be loaded.")
    setClients(body.clients ?? [])
  }

  useEffect(() => {
    if (!canManage) return
    const controller = new AbortController()
    fetch("/api/v1/integrations/clients", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json() as { clients?: ApiClient[]; error?: { message?: string } }
        if (!response.ok) throw new Error(body.error?.message ?? "API clients could not be loaded.")
        return body.clients ?? []
      })
      .then((rows) => setClients(rows))
      .catch((error) => { if (error instanceof Error && error.name !== "AbortError") setMessage(error.message) })
    return () => controller.abort()
  }, [canManage])

  async function createClient(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true); setMessage(""); setApiKey("")
    try {
      const response = await fetch("/api/v1/integrations/clients", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, scopes, expiresInDays: 90 }),
      })
      const body = await response.json() as { apiKey?: string; error?: { message?: string } }
      if (!response.ok || !body.apiKey) throw new Error(body.error?.message ?? "API client could not be created.")
      setApiKey(body.apiKey)
      setName("")
      await refresh()
    } catch (error) { setMessage(error instanceof Error ? error.message : "API client could not be created.") }
    finally { setBusy(false) }
  }

  async function revoke(id: string) {
    setBusy(true); setMessage("")
    try {
      const response = await fetch(`/api/v1/integrations/clients/${encodeURIComponent(id)}`, { method: "DELETE" })
      const body = await response.json() as { error?: { message?: string } }
      if (!response.ok) throw new Error(body.error?.message ?? "API client could not be revoked.")
      setPendingRevoke(null)
      await refresh()
    } catch (error) { setMessage(error instanceof Error ? error.message : "API client could not be revoked.") }
    finally { setBusy(false) }
  }

  return <div className="space-y-4">
    <Card>
      <CardHeader className="border-b border-border"><CardTitle>Integration API</CardTitle></CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left">
          <thead><tr className="border-b border-border bg-muted/35"><th className="px-4 py-2">Method</th><th className="px-4 py-2">Endpoint</th><th className="px-4 py-2">Purpose</th></tr></thead>
          <tbody>{endpoints.map(([method, path, purpose]) => <tr key={path} className="border-b border-border/70 last:border-b-0"><td className="px-4 py-3 text-status font-semibold text-primary">{method}</td><td className="px-4 py-3 font-mono text-meta">{path}</td><td className="px-4 py-3 text-body text-muted-foreground">{purpose}</td></tr>)}</tbody>
        </table></div>
        <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3"><a className="text-button text-primary" href="/api/v1/integrations/openapi" target="_blank" rel="noreferrer">OpenAPI 3.1 contract</a><span className="text-meta text-muted-foreground">Scoped credentials · request audit · 120 requests per minute</span></div>
      </CardContent>
    </Card>

    {!canManage ? <p className="surface-card p-4 text-body text-muted-foreground">An administrator manages service credentials.</p> : <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Card className="h-fit">
        <CardHeader className="border-b border-border"><CardTitle>Create API client</CardTitle></CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={createClient}>
            <label className="block text-label">Client name<input required minLength={3} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3" placeholder="Workforce BI connector" /></label>
            <fieldset><legend className="text-label">Scopes</legend><div className="mt-2 space-y-2">{availableScopes.map((scope) => <label key={scope.value} className="flex items-center gap-2 text-body"><input type="checkbox" checked={scopes.includes(scope.value)} onChange={(event) => setScopes((current) => event.target.checked ? [...current, scope.value] : current.filter((item) => item !== scope.value))} className="accent-primary" />{scope.label}</label>)}</div></fieldset>
            <Button type="submit" disabled={busy || !scopes.length}>Create 90-day credential</Button>
          </form>
          {apiKey && <div className="mt-4 rounded-md border border-warning/35 bg-warning/5 p-3"><p className="text-card-title">Copy this credential now</p><p className="mt-1 break-all font-mono text-meta">{apiKey}</p><Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => void navigator.clipboard.writeText(apiKey)}>Copy credential</Button><p className="mt-2 text-meta text-muted-foreground">It is stored only as a hash and cannot be shown again.</p></div>}
          {message && <p role="alert" className="mt-3 text-body text-destructive">{message}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-border"><CardTitle>API clients</CardTitle></CardHeader>
        <CardContent className="p-0"><RegisterPagination rows={clients} itemLabel="API clients" resetKey="integration-api-clients">{(pageRows) => <div className="divide-y divide-border">{pageRows.length ? pageRows.map((client) => <div key={client.id} className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,1fr)_180px_120px_auto] md:items-center"><div><p className="text-card-title">{client.name}</p><p className="text-meta text-muted-foreground">{client.keyPrefix} · {client.scopes.join(", ")}</p></div><div><p className="text-meta text-muted-foreground">Expires</p><p className="text-body">{formatWorkspaceDateTime(client.expiresAt)}</p></div><div><p className="text-meta text-muted-foreground">Last used</p><p className="text-body">{client.lastUsedAt ? formatWorkspaceDateTime(client.lastUsedAt) : "Never"}</p></div>{client.status === "active" ? <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setPendingRevoke(client)}>Revoke</Button> : <span className="text-status font-semibold text-muted-foreground">Revoked</span>}</div>) : <p className="p-5 text-body text-muted-foreground">No API clients.</p>}</div>}</RegisterPagination></CardContent>
      </Card>
    </div>}
    {pendingRevoke && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-foreground/25 p-4" role="dialog" aria-modal="true" aria-labelledby="revoke-api-client-title">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl">
        <h3 id="revoke-api-client-title" className="text-subsection font-semibold">Revoke API client?</h3>
        <p className="mt-2 text-body text-muted-foreground">{pendingRevoke.name} will lose access immediately. Existing credentials cannot be restored.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setPendingRevoke(null)} disabled={busy}>Cancel</Button>
          <Button type="button" variant="destructive" onClick={() => void revoke(pendingRevoke.id)} disabled={busy}>{busy ? "Revoking" : "Revoke client"}</Button>
        </div>
      </div>
    </div>}
  </div>
}
