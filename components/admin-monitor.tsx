"use client"

import { useState } from "react"

import type { AdminMonitor as AdminMonitorData } from "@/lib/server/admin-monitor"
import { Button } from "@/components/ui/button"
import { MetricStrip } from "@/components/workspace-ui"

const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })
const money = (value: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(value)
const dateTime = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" })

function ProviderUnavailable({ reason }: { reason: string }) {
  return <p className="p-5 text-body text-muted-foreground">{reason}</p>
}

export function AdminMonitor({ initialData }: { initialData: AdminMonitorData }) {
  const [data, setData] = useState(initialData)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const cost = data.cost.status === "ready" ? data.cost.data : null
  async function refresh() {
    setBusy(true); setMessage("")
    try {
      const response = await fetch("/api/v1/admin/metrics", { cache: "no-store" })
      if (!response.ok) throw new Error("Monitor could not be refreshed.")
      setData(await response.json() as AdminMonitorData)
    } catch (error) { setMessage(error instanceof Error ? error.message : "Monitor could not be refreshed.") }
    finally { setBusy(false) }
  }
  return <div className="workspace-stack">
    <header className="workspace-header"><div><h1 className="text-page-title">Operations monitor</h1><p className="text-page-description">Application health, usage, integrations, and Azure cost.</p></div><Button variant="outline" onClick={() => void refresh()} disabled={busy}>{busy ? "Refreshing" : "Refresh"}</Button></header>
    {message && <p role="alert" className="text-body text-destructive">{message}</p>}
    {data.usage.status === "ready" ? <>
      <MetricStrip metrics={[
        { label: "Active users", value: integer.format(data.usage.data.users.active30d), detail: `${integer.format(data.usage.data.users.total)} enabled accounts` },
        { label: "Open work", value: integer.format(data.usage.data.work.open), detail: `${integer.format(data.usage.data.work.overdue)} overdue` },
        { label: "API requests", value: integer.format(data.usage.data.integrations.requests24h), detail: `${integer.format(data.usage.data.integrations.failed24h)} failed in 24 hours` },
        { label: "Active API clients", value: integer.format(data.usage.data.integrations.activeClients), detail: "Unexpired service credentials" },
      ]} />
      <section className="surface-card overflow-hidden"><div className="border-b border-border px-5 py-4"><h2 className="text-section-title">Internal operations</h2></div><div className="grid divide-y divide-border md:grid-cols-3 md:divide-x md:divide-y-0"><div className="p-5"><p className="text-label text-muted-foreground">Completed work</p><p className="mt-1 text-kpi tabular-nums">{integer.format(data.usage.data.work.completed30d)}</p><p className="text-meta text-muted-foreground">Last 30 days</p></div><div className="p-5"><p className="text-label text-muted-foreground">Integration p95</p><p className="mt-1 text-kpi tabular-nums">{integer.format(data.usage.data.integrations.p95Ms)} ms</p><p className="text-meta text-muted-foreground">Audited service requests</p></div><div className="p-5"><p className="text-label text-muted-foreground">Imports</p><p className="mt-1 text-kpi tabular-nums">{integer.format(data.usage.data.imports.completed30d)}</p><p className="text-meta text-muted-foreground">{integer.format(data.usage.data.imports.failed30d)} failed in 30 days</p></div></div></section>
    </> : <section className="surface-card"><ProviderUnavailable reason={data.usage.reason} /></section>}
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="surface-card overflow-hidden"><div className="border-b border-border px-5 py-4"><h2 className="text-section-title">Application performance</h2></div>{data.application.status === "ready" ? <div className="grid grid-cols-2 gap-px bg-border"><div className="bg-card p-5"><p className="text-label text-muted-foreground">Requests</p><p className="mt-1 text-kpi tabular-nums">{integer.format(data.application.data.requests)}</p></div><div className="bg-card p-5"><p className="text-label text-muted-foreground">Failure rate</p><p className="mt-1 text-kpi tabular-nums">{(data.application.data.failureRate * 100).toFixed(1)}%</p></div><div className="bg-card p-5"><p className="text-label text-muted-foreground">Average</p><p className="mt-1 text-kpi tabular-nums">{integer.format(data.application.data.averageMs)} ms</p></div><div className="bg-card p-5"><p className="text-label text-muted-foreground">p95</p><p className="mt-1 text-kpi tabular-nums">{integer.format(data.application.data.p95Ms)} ms</p></div></div> : <ProviderUnavailable reason={data.application.reason} />}</section>
      <section className="surface-card overflow-hidden"><div className="border-b border-border px-5 py-4"><h2 className="text-section-title">Azure cost</h2></div>{cost ? <div><div className="p-5"><p className="text-label text-muted-foreground">Month to date</p><p className="mt-1 text-kpi tabular-nums">{money(cost.monthToDate, cost.currency)}</p><p className="mt-1 text-meta text-muted-foreground">Updated {dateTime.format(new Date(cost.refreshedAt))} · {cost.stale ? "Last successful snapshot" : "Refreshed daily"}</p></div><div className="divide-y divide-border border-t border-border">{cost.byService.slice(0, 8).map((row) => <div key={row.service} className="flex items-center justify-between gap-3 px-5 py-3"><span className="text-body">{row.service}</span><span className="text-body tabular-nums">{money(row.cost, cost.currency)}</span></div>)}</div></div> : <ProviderUnavailable reason={data.cost.status === "unavailable" ? data.cost.reason : "Cost data is unavailable."} />}</section>
    </div>
  </div>
}
