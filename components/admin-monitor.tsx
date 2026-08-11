"use client"

import { useState } from "react"

import type { AdminMonitor as AdminMonitorData } from "@/lib/server/admin-monitor"
import { Button } from "@/components/ui/button"
import { MetricStrip } from "@/components/workspace-ui"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })
const money = (value: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(value)
const dateTime = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" })

function ProviderUnavailable({ reason, badge = true }: { reason: string; badge?: boolean }) {
  return <div className="p-5">{badge && <Badge variant="secondary">Unavailable</Badge>}<p className={cn("max-w-2xl text-body text-muted-foreground", badge && "mt-2")}>{reason}</p></div>
}

function MonitorMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="min-w-0 px-5 py-4"><p className="text-label text-muted-foreground">{label}</p><p className="mt-1 text-section-title tabular-nums">{value}</p><p className="mt-0.5 text-meta text-muted-foreground">{detail}</p></div>
}

function SectionHeader({ title, detail, status }: { title: string; detail: string; status?: "Healthy" | "Unavailable" }) {
  return <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4"><div><h2 className="text-section-title">{title}</h2><p className="mt-0.5 text-meta text-muted-foreground">{detail}</p></div>{status && <Badge variant={status === "Healthy" ? "outline" : "secondary"}>{status}</Badge>}</div>
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
    <header className="workspace-header"><div><h1 className="text-page-title">Operations monitor</h1><p className="text-page-description">Service health, operational usage, integrations, and Azure spend.</p></div><Button variant="outline" onClick={() => void refresh()} disabled={busy}>{busy ? "Refreshing" : "Refresh data"}</Button></header>
    {message && <p role="alert" className="text-body text-destructive">{message}</p>}
    {data.usage.status === "ready" ? <>
      <MetricStrip metrics={[
        { label: "Active users", value: integer.format(data.usage.data.users.active30d), detail: `${integer.format(data.usage.data.users.total)} enabled accounts` },
        { label: "Open work", value: integer.format(data.usage.data.work.open), detail: `${integer.format(data.usage.data.work.overdue)} overdue` },
        { label: "API requests", value: integer.format(data.usage.data.integrations.requests24h), detail: `${integer.format(data.usage.data.integrations.failed24h)} failed in 24 hours` },
        { label: "Active API clients", value: integer.format(data.usage.data.integrations.activeClients), detail: "Unexpired service credentials" },
      ]} />
      <section className="surface-card overflow-hidden"><SectionHeader title="Workspace activity" detail="Durable workflow, integration, and import activity." /><div className="grid divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0"><MonitorMetric label="Completed work" value={integer.format(data.usage.data.work.completed30d)} detail="Last 30 days" /><MonitorMetric label="Integration latency" value={`${integer.format(data.usage.data.integrations.p95Ms)} ms`} detail="p95 for audited API requests" /><MonitorMetric label="Completed imports" value={integer.format(data.usage.data.imports.completed30d)} detail={`${integer.format(data.usage.data.imports.failed30d)} failed in 30 days`} /></div></section>
    </> : <section className="surface-card"><ProviderUnavailable reason={data.usage.reason} /></section>}
    <div className="grid items-start gap-4 xl:grid-cols-2">
      <section className="surface-card overflow-hidden"><SectionHeader title="Application performance" detail="Application Insights telemetry for the last 24 hours." status={data.application.status === "ready" ? "Healthy" : "Unavailable"} />{data.application.status === "ready" ? <div className="grid divide-x divide-y divide-border sm:grid-cols-2 [&>*:nth-child(-n+2)]:border-t-0"><MonitorMetric label="Requests" value={integer.format(data.application.data.requests)} detail="Observed requests" /><MonitorMetric label="Failure rate" value={`${(data.application.data.failureRate * 100).toFixed(1)}%`} detail="Failed requests / requests" /><MonitorMetric label="Average latency" value={`${integer.format(data.application.data.averageMs)} ms`} detail="Mean response duration" /><MonitorMetric label="p95 latency" value={`${integer.format(data.application.data.p95Ms)} ms`} detail="95% of requests complete below this" /></div> : <ProviderUnavailable reason={data.application.reason} badge={false} />}</section>
      <section className="surface-card overflow-hidden"><SectionHeader title="Azure cost" detail="Month-to-date resource cost from the latest available snapshot." status={cost ? "Healthy" : "Unavailable"} />{cost ? <div><div className="px-5 py-4"><p className="text-label text-muted-foreground">Month to date</p><p className="mt-1 text-kpi tabular-nums">{money(cost.monthToDate, cost.currency)}</p><p className="mt-1 text-meta text-muted-foreground">Updated {dateTime.format(new Date(cost.refreshedAt))} · {cost.stale ? "Cached after the last successful refresh" : "Current daily snapshot"}</p></div><div className="divide-y divide-border border-t border-border">{cost.byService.slice(0, 8).map((row) => <div key={row.service} className="flex items-center justify-between gap-3 px-5 py-2.5"><span className="truncate text-body">{row.service}</span><span className="shrink-0 text-body tabular-nums">{money(row.cost, cost.currency)}</span></div>)}</div></div> : <ProviderUnavailable reason={data.cost.status === "unavailable" ? data.cost.reason : "Cost data is unavailable."} badge={false} />}</section>
    </div>
  </div>
}
