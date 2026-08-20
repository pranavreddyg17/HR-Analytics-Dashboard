"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import * as m from "motion/react-m"

import { Button } from "@/components/ui/button"
import { MetricStrip, WorkspaceHeader, WorkspacePage, WorkspaceSectionHeader } from "@/components/workspace-ui"
import type { AssetInventory, AssetRecord, AssetStatus, AssetType } from "@/lib/exit-asset-types"
import { cn } from "@/lib/utils"

const fieldClass = "h-9 w-full rounded-md border border-border bg-background px-3 text-control outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
const assetTypes: AssetType[] = ["Laptop", "Monitor", "Phone", "Access badge", "Other"]
const assetStatuses: AssetStatus[] = ["Available", "Assigned", "Returned", "Broken", "Lost", "Retired"]
const PAGE_SIZE = 25

function date(value: string | null): string {
  if (!value) return "Not recorded"
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function AssetState({ asset }: { asset: AssetRecord }) {
  const color = asset.lifecycle === "Broken" ? "text-destructive" : asset.lifecycle === "Degraded" || asset.lifecycle === "Replacement Soon" ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300"
  return <span className={cn("text-status font-semibold", color)}>{asset.lifecycle}</span>
}

export function AssetInventoryWorkspace({ initialData, canManage }: { initialData: AssetInventory; canManage: boolean }) {
  const [data, setData] = useState(initialData)
  const [search, setSearch] = useState("")
  const [type, setType] = useState("")
  const [status, setStatus] = useState("")
  const [showCreate, setShowCreate] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [page, setPage] = useState(0)
  const [loadedPage, setLoadedPage] = useState(0)
  const [loadedSignature, setLoadedSignature] = useState("\0\0")
  const [loading, setLoading] = useState(false)
  const initialRequest = useRef(true)
  const activeRequest = useRef<AbortController | null>(null)
  const requestSequence = useRef(0)
  const loadedPageRef = useRef(0)
  const loadedSignatureRef = useRef("\0\0")
  const querySignature = `${search.trim()}\0${type}\0${status}`
  const resultsAreCurrent = loadedPage === page && loadedSignature === querySignature

  const loadAssets = useCallback(async (targetPage: number) => {
    activeRequest.current?.abort()
    const controller = new AbortController()
    const requestId = ++requestSequence.current
    const requestSignature = `${search.trim()}\0${type}\0${status}`
    activeRequest.current = controller
    setLoading(true); setError("")
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(targetPage * PAGE_SIZE) })
      if (search.trim()) params.set("search", search.trim())
      if (type) params.set("type", type)
      if (status) params.set("status", status)
      const response = await fetch(`/api/v1/hr/assets?${params}`, { cache: "no-store", signal: controller.signal })
      const body = await response.json() as AssetInventory & { error?: string }
      if (!response.ok) throw new Error(body.error || "Inventory could not be refreshed.")
      if (controller.signal.aborted || requestId !== requestSequence.current) return
      setData(body)
      loadedPageRef.current = targetPage
      loadedSignatureRef.current = requestSignature
      setLoadedPage(targetPage)
      setLoadedSignature(requestSignature)
    } catch (reason) {
      if ((reason as { name?: string }).name === "AbortError" || requestId !== requestSequence.current) return
      setError(reason instanceof Error ? reason.message : "Inventory could not be refreshed.")
      if (requestSignature === loadedSignatureRef.current) setPage(loadedPageRef.current)
    } finally {
      if (requestId === requestSequence.current) {
        setLoading(false)
        if (activeRequest.current === controller) activeRequest.current = null
      }
    }
  }, [search, status, type])

  useEffect(() => {
    if (initialRequest.current) { initialRequest.current = false; return }
    const timer = window.setTimeout(() => void loadAssets(page), search.trim() ? 220 : 0)
    return () => {
      window.clearTimeout(timer)
      activeRequest.current?.abort()
      requestSequence.current += 1
    }
  }, [loadAssets, page, search])

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true); setError(""); setMessage("")
    try {
      const response = await fetch("/api/v1/hr/assets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        assetTag: form.get("assetTag"), assetType: form.get("assetType"), manufacturer: form.get("manufacturer"), model: form.get("model"), serialNumber: form.get("serialNumber"),
        status: form.get("status"), condition: form.get("condition"), acquiredOn: form.get("acquiredOn"), warrantyExpiresOn: form.get("warrantyExpiresOn"), replacementDueOn: form.get("replacementDueOn"), notes: form.get("notes"),
      }) })
      const body = await response.json() as AssetRecord & { error?: string }
      if (!response.ok) throw new Error(body.error || "Asset could not be created.")
      setShowCreate(false); setMessage(`${body.assetTag} added to inventory.`); await loadAssets(page)
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Asset could not be created.") }
    finally { setBusy(false) }
  }

  return <WorkspacePage>
    <WorkspaceHeader title="Asset inventory" description="Company equipment, assignments, and lifecycle status." meta={`${data.summary.total.toLocaleString()} asset${data.summary.total === 1 ? "" : "s"}`} actions={<div className="flex gap-2"><Button variant="outline" onClick={() => void loadAssets(page)} disabled={busy || loading}>Refresh</Button>{canManage && <Button onClick={() => setShowCreate((current) => !current)}>{showCreate ? "Close" : "Add asset"}</Button>}</div>} />
    <MetricStrip metrics={[
      { label: "Assigned", value: data.summary.assigned, detail: `${data.summary.available} available` },
      { label: "Needs attention", value: data.summary.broken + data.summary.lost + data.summary.degraded, detail: `${data.summary.broken} broken · ${data.summary.lost} lost · ${data.summary.degraded} degraded` },
      { label: "Warranty expiring", value: data.summary.warrantyExpiring, detail: "Within 90 days" },
      { label: "Replacement due", value: data.summary.replacementDue, detail: "Due or within 90 days" },
    ]} />
    {showCreate && <form onSubmit={create} className="surface-card overflow-hidden">
      <WorkspaceSectionHeader title="Add asset" description="Create the inventory record before assigning it." />
      <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
        <label className="text-label font-semibold">Asset ID<input required name="assetTag" className={fieldClass} placeholder="LAIDBACKHR-LT-0001" /></label>
        <label className="text-label font-semibold">Type<select name="assetType" className={fieldClass}>{assetTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="text-label font-semibold">Manufacturer<input name="manufacturer" className={fieldClass} /></label>
        <label className="text-label font-semibold">Model<input name="model" className={fieldClass} /></label>
        <label className="text-label font-semibold">Serial number<input name="serialNumber" className={fieldClass} /></label>
        <label className="text-label font-semibold">Status<select name="status" className={fieldClass}>{assetStatuses.filter((item) => item !== "Assigned").map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="text-label font-semibold">Condition<select name="condition" className={fieldClass}><option>Good</option><option>Degraded</option><option>Broken</option></select></label>
        <label className="text-label font-semibold">Acquired<input name="acquiredOn" type="date" className={fieldClass} /></label>
        <label className="text-label font-semibold">Warranty expires<input name="warrantyExpiresOn" type="date" className={fieldClass} /></label>
        <label className="text-label font-semibold">Replacement due<input name="replacementDueOn" type="date" className={fieldClass} /></label>
        <label className="text-label font-semibold sm:col-span-2">Notes<input name="notes" className={fieldClass} /></label>
      </div>
      <div className="flex justify-end border-t border-border px-4 py-3"><Button type="submit" disabled={busy}>{busy ? "Saving" : "Save asset"}</Button></div>
    </form>}
    {message && <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-meta text-emerald-800">{message}</p>}
    {error && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-meta text-rose-800">{error}</p>}
    <section className="surface-card overflow-hidden" aria-busy={loading}>
      <WorkspaceSectionHeader title="Inventory" description="Select an asset to review ownership and assignment history." />
      <div className="grid gap-3 border-b border-border p-3 sm:grid-cols-3">
        <input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0) }} className={fieldClass} placeholder="Search ID, serial, model, or employee" />
        <select value={type} onChange={(event) => { setType(event.target.value); setPage(0) }} className={fieldClass}><option value="">All asset types</option>{assetTypes.map((item) => <option key={item}>{item}</option>)}</select>
        <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(0) }} className={fieldClass}><option value="">All statuses</option>{assetStatuses.map((item) => <option key={item}>{item}</option>)}</select>
      </div>
      {loading && <div className="h-0.5 overflow-hidden bg-primary/10" role="status" aria-label="Loading asset inventory"><div className="h-full w-full animate-pulse bg-primary" /></div>}
      {resultsAreCurrent ? <m.div key={`${loadedSignature}-${loadedPage}-${data.generatedAt}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.14 }}>
        <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-body"><thead className="bg-muted/35 text-label font-semibold text-muted-foreground"><tr><th className="px-4 py-2.5">Asset</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Assigned to</th><th className="px-4 py-2.5">Lifecycle</th><th className="px-4 py-2.5">Warranty</th><th className="px-4 py-2.5">Replacement</th><th className="px-4 py-2.5"><span className="sr-only">Open</span></th></tr></thead><tbody>{data.items.map((asset) => <tr key={asset.id} className="border-t border-border/70 hover:bg-muted/20"><td className="px-4 py-3"><p className="font-semibold">{asset.assetTag}</p><p className="text-meta text-muted-foreground">{asset.assetType} · {[asset.manufacturer, asset.model].filter(Boolean).join(" ") || "Model not recorded"}</p></td><td className="px-4 py-3">{asset.status}<p className="text-meta text-muted-foreground">{asset.condition}</p></td><td className="px-4 py-3">{asset.currentAssignment?.employeeName ?? "Unassigned"}{asset.currentAssignment && <p className="text-meta text-muted-foreground">Since {date(asset.currentAssignment.assignedAt)}</p>}</td><td className="px-4 py-3"><AssetState asset={asset} /></td><td className="px-4 py-3">{date(asset.warrantyExpiresOn)}</td><td className="px-4 py-3">{date(asset.replacementDueOn)}</td><td className="px-4 py-3 text-right"><Button nativeButton={false} size="xs" variant="outline" render={<Link href={`/assets/${encodeURIComponent(asset.assetTag)}`} />}>Open</Button></td></tr>)}</tbody></table></div>
        {!data.items.length && <p className="px-5 py-10 text-center text-body text-muted-foreground">No assets match these filters.</p>}
      </m.div> : <p className="px-5 py-10 text-center text-body text-muted-foreground">{loading ? "Loading inventory…" : "Inventory results could not be loaded."}</p>}
      {resultsAreCurrent && data.total > 0 && <footer className="flex flex-col gap-2 border-t border-border bg-muted/20 px-4 py-2.5 text-meta text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><p aria-live="polite" className="tabular-nums">{loadedPage * PAGE_SIZE + 1}–{Math.min((loadedPage + 1) * PAGE_SIZE, data.total)} of {data.total.toLocaleString()} assets</p><div className="flex items-center gap-2"><Button type="button" size="xs" variant="outline" disabled={loadedPage === 0 || loading} onClick={() => setPage((current) => Math.max(0, current - 1))}>Previous</Button><span className="min-w-20 text-center tabular-nums">Page {loadedPage + 1} of {Math.max(1, Math.ceil(data.total / PAGE_SIZE))}</span><Button type="button" size="xs" variant="outline" disabled={(loadedPage + 1) * PAGE_SIZE >= data.total || loading} onClick={() => setPage((current) => current + 1)}>Next</Button></div></footer>}
    </section>
  </WorkspacePage>
}
