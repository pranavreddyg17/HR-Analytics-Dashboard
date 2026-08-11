"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { WorkspaceHeader, WorkspacePage, WorkspaceSectionHeader } from "@/components/workspace-ui"
import type { AssetCondition, AssetDetail } from "@/lib/exit-asset-types"
import type { ManagedEmployee } from "@/lib/people-types"

const fieldClass = "h-9 w-full rounded-md border border-border bg-background px-3 text-control outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"

function date(value: string | null): string {
  if (!value) return "Not recorded"
  const parsed = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export function AssetDetailWorkspace({ initialData, canManage }: { initialData: AssetDetail; canManage: boolean }) {
  const [asset, setAsset] = useState(initialData)
  const [search, setSearch] = useState("")
  const [employees, setEmployees] = useState<ManagedEmployee[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState("")
  const [returnCondition, setReturnCondition] = useState<AssetCondition>("Good")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    if (!search.trim() || asset.currentAssignment) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => fetch(`/api/v1/hr/people?search=${encodeURIComponent(search.trim())}&limit=20`, { signal: controller.signal, cache: "no-store" })
      .then((response) => response.json()).then((body: { items?: ManagedEmployee[] }) => setEmployees(body.items ?? [])).catch(() => undefined), 220)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [asset.currentAssignment, search])

  async function apply(url: string, payload: Record<string, unknown>, success: string) {
    setBusy(true); setError(""); setMessage("")
    try {
      const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) })
      const body = await response.json() as AssetDetail & { error?: string }
      if (!response.ok) throw new Error(body.error || "Asset update failed.")
      setAsset(body); setMessage(success); setSearch(""); setSelectedEmployee(""); setEmployees([])
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Asset update failed.") }
    finally { setBusy(false) }
  }

  return <WorkspacePage>
    <WorkspaceHeader title={asset.assetTag} description={`${asset.assetType} inventory record.`} meta={`${asset.status} · ${asset.condition} · ${asset.lifecycle}`} actions={<Button nativeButton={false} variant="outline" render={<Link href="/assets" />}>Back to inventory</Button>} />
    {message && <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-meta text-emerald-800">{message}</p>}
    {error && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-meta text-rose-800">{error}</p>}
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,.75fr)]">
      <section className="surface-card overflow-hidden"><WorkspaceSectionHeader title="Asset details" /><dl className="grid gap-x-5 gap-y-4 p-5 sm:grid-cols-2 lg:grid-cols-3">{[
        ["Type", asset.assetType], ["Manufacturer", asset.manufacturer ?? "Not recorded"], ["Model", asset.model ?? "Not recorded"], ["Serial number", asset.serialNumber ?? "Not recorded"],
        ["Acquired", date(asset.acquiredOn)], ["Warranty expires", date(asset.warrantyExpiresOn)], ["Replacement due", date(asset.replacementDueOn)], ["Condition", asset.condition], ["Lifecycle", asset.lifecycle],
      ].map(([label, value]) => <div key={label}><dt className="text-label font-semibold text-muted-foreground">{label}</dt><dd className="mt-1 text-body">{value}</dd></div>)}</dl></section>
      <section className="surface-card overflow-hidden"><WorkspaceSectionHeader title="Current assignment" description={asset.currentAssignment ? "Return records update inventory and any open offboarding task." : "Search the employee directory to assign this asset."} /><div className="space-y-3 p-5">{asset.currentAssignment ? <>
        <div><p className="text-card-title font-semibold">{asset.currentAssignment.employeeName}</p><Link href={`/people/${encodeURIComponent(asset.currentAssignment.employeeId)}`} className="text-meta text-primary hover:underline">{asset.currentAssignment.employeeId}</Link><p className="mt-1 text-meta text-muted-foreground">Assigned {date(asset.currentAssignment.assignedAt)}</p></div>
        {canManage && <><label className="block text-label font-semibold">Return condition<select value={returnCondition} onChange={(event) => setReturnCondition(event.target.value as AssetCondition)} className={fieldClass}><option>Good</option><option>Degraded</option><option>Broken</option></select></label><Button disabled={busy} onClick={() => void apply(`/api/v1/hr/assets/${encodeURIComponent(asset.id)}/return`, { condition: returnCondition }, "Asset return recorded.")}>Record return</Button></>}
      </> : canManage ? <>
        <label className="block text-label font-semibold">Employee<input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setSelectedEmployee(""); setEmployees([]) }} className={fieldClass} placeholder="Search name, email, role, or ID" /></label>
        {employees.length > 0 && <div className="max-h-56 overflow-y-auto rounded-md border border-border">{employees.map((employee) => <button key={employee.employee_id} type="button" onClick={() => { setSelectedEmployee(employee.employee_id); setSearch(employee.display_name); setEmployees([]) }} className="block w-full border-b border-border px-3 py-2 text-left last:border-b-0 hover:bg-muted"><span className="block text-body font-semibold">{employee.display_name}</span><span className="text-meta text-muted-foreground">{employee.job_title} · {employee.employee_id}</span></button>)}</div>}
        <Button disabled={busy || !selectedEmployee} onClick={() => void apply(`/api/v1/hr/assets/${encodeURIComponent(asset.id)}/assign`, { employeeId: selectedEmployee }, "Asset assigned.")}>Assign asset</Button>
      </> : <p className="text-body text-muted-foreground">This asset is unassigned.</p>}</div></section>
    </div>
    <section className="surface-card overflow-hidden"><WorkspaceSectionHeader title="Assignment history" description="Current and previous custodians." /><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-body"><thead className="bg-muted/35 text-label font-semibold text-muted-foreground"><tr><th className="px-4 py-2.5">Employee</th><th className="px-4 py-2.5">Assigned</th><th className="px-4 py-2.5">Returned</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Return condition</th></tr></thead><tbody>{asset.assignmentHistory.map((row) => <tr key={row.id} className="border-t border-border"><td className="px-4 py-3"><Link className="font-semibold hover:text-primary hover:underline" href={`/people/${encodeURIComponent(row.employeeId)}`}>{row.employeeName}</Link><p className="text-meta text-muted-foreground">{row.employeeId}</p></td><td className="px-4 py-3">{date(row.assignedAt)}</td><td className="px-4 py-3">{date(row.returnedAt)}</td><td className="px-4 py-3">{row.status}</td><td className="px-4 py-3">{row.returnCondition ?? "—"}</td></tr>)}</tbody></table></div>{!asset.assignmentHistory.length && <p className="p-8 text-center text-body text-muted-foreground">No assignment history.</p>}</section>
  </WorkspacePage>
}
