"use client"

import { useCallback, useEffect, useState } from "react"

import type { AdminMonitor as AdminMonitorData, AdminMonitorProviders, AdminMonitorUsage } from "@/lib/server/admin-monitor"
import { Button } from "@/components/ui/button"
import { MetricStrip, WorkspaceHeader, WorkspacePage } from "@/components/workspace-ui"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })
const money = (value: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(value)
const dateTime = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" })

function ProviderUnavailable({ reason }: { reason: string }) {
  return <div className="p-5"><p className="max-w-2xl text-body text-muted-foreground">{reason}</p></div>
}

function ProviderLoading() {
  return <div className="grid grid-cols-2 gap-px bg-border" aria-label="Loading provider metrics">
    {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-24 animate-pulse bg-card p-5"><div className="h-3 w-20 rounded bg-muted"/><div className="mt-3 h-6 w-28 rounded bg-muted"/></div>)}
  </div>
}

function MonitorMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="min-w-0 px-5 py-4"><p className="text-label text-muted-foreground">{label}</p><p className="mt-1 text-section-title tabular-nums">{value}</p><p className="mt-0.5 text-meta text-muted-foreground">{detail}</p></div>
}

function SectionHeader({ title, detail, status }: { title: string; detail: string; status?: "Healthy" | "Unavailable" }) {
  return <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4"><div><h2 className="text-card-title font-semibold">{title}</h2><p className="mt-0.5 text-meta text-muted-foreground">{detail}</p></div>{status && <Badge variant={status === "Healthy" ? "outline" : "secondary"}>{status}</Badge>}</div>
}

export function AdminMonitor({ initialData }: { initialData: AdminMonitorUsage }) {
  const [usage, setUsage] = useState(initialData.usage)
  const [providers, setProviders] = useState<AdminMonitorProviders | null>(null)
  const [providerLoading, setProviderLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")

  const loadProviders = useCallback(async () => {
    setProviderLoading(true)
    try {
      const response = await fetch("/api/v1/admin/metrics?section=providers", { cache: "no-store" })
      if (!response.ok) throw new Error("Azure monitoring data could not be refreshed.")
      setProviders(await response.json() as AdminMonitorProviders)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Azure monitoring data could not be refreshed.")
    } finally { setProviderLoading(false) }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/v1/admin/metrics?section=providers", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Azure monitoring data could not be loaded.")
        setProviders(await response.json() as AdminMonitorProviders)
      })
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name !== "AbortError") setMessage(error instanceof Error ? error.message : "Azure monitoring data could not be loaded.")
      })
      .finally(() => { if (!controller.signal.aborted) setProviderLoading(false) })
    return () => controller.abort()
  }, [])

  async function refresh() {
    setBusy(true); setMessage("")
    const usageRequest = fetch("/api/v1/admin/metrics?section=usage", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Workspace activity could not be refreshed.")
        setUsage((await response.json() as AdminMonitorUsage).usage)
      })
    const providerRequest = loadProviders()
    const results = await Promise.allSettled([usageRequest, providerRequest])
    const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected")
    if (rejected) setMessage(rejected.reason instanceof Error ? rejected.reason.message : "Monitor could not be refreshed.")
    setBusy(false)
  }

  const cost = providers?.cost.status === "ready" ? providers.cost.data : null
  const application = providers?.application ?? null

  return <WorkspacePage>
    <WorkspaceHeader title="Operations monitor" description="Workspace activity, service performance, and Azure spend." actions={<Button variant="outline" onClick={() => void refresh()} disabled={busy}>{busy ? "Refreshing" : "Refresh"}</Button>} />
    {message && <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-body text-destructive">{message}</p>}
    {usage.status === "ready" ? <>
      <MetricStrip metrics={[
        { label: "Active users", value: integer.format(usage.data.users.active30d), detail: `${integer.format(usage.data.users.total)} enabled accounts` },
        { label: "Open work", value: integer.format(usage.data.work.open), detail: `${integer.format(usage.data.work.overdue)} overdue` },
        { label: "API requests", value: integer.format(usage.data.integrations.requests24h), detail: `${integer.format(usage.data.integrations.failed24h)} failed in 24 hours` },
        { label: "API clients", value: integer.format(usage.data.integrations.activeClients), detail: "Active service credentials" },
      ]} />
      <section className="surface-card overflow-hidden"><SectionHeader title="Workspace activity" detail="Persisted activity from the last 30 days." /><div className="grid divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0"><MonitorMetric label="Completed work" value={integer.format(usage.data.work.completed30d)} detail="Workflow items" /><MonitorMetric label="Integration p95" value={`${integer.format(usage.data.integrations.p95Ms)} ms`} detail="Audited API requests" /><MonitorMetric label="Completed imports" value={integer.format(usage.data.imports.completed30d)} detail={`${integer.format(usage.data.imports.failed30d)} failed`}/></div></section>
    </> : <section className="surface-card"><ProviderUnavailable reason={usage.reason} /></section>}

    <div className="grid items-start gap-4 xl:grid-cols-2">
      <section className="surface-card overflow-hidden"><SectionHeader title="Application performance" detail="Application Insights · last 24 hours" status={!providerLoading && application ? application.status === "ready" ? "Healthy" : "Unavailable" : undefined} />
        {providerLoading && !application ? <ProviderLoading /> : application?.status === "ready" ? <div className="grid divide-x divide-y divide-border sm:grid-cols-2"><MonitorMetric label="Requests" value={integer.format(application.data.requests)} detail="Observed requests" /><MonitorMetric label="Failure rate" value={`${(application.data.failureRate * 100).toFixed(1)}%`} detail="Failed / total" /><MonitorMetric label="Average latency" value={`${integer.format(application.data.averageMs)} ms`} detail="Mean duration" /><MonitorMetric label="p95 latency" value={`${integer.format(application.data.p95Ms)} ms`} detail="95th percentile" /></div> : <ProviderUnavailable reason={application?.reason ?? "Performance telemetry is unavailable."} />}
      </section>
      <section className="surface-card overflow-hidden"><SectionHeader title="Azure cost" detail="Latest month-to-date snapshot" status={!providerLoading && providers ? cost ? "Healthy" : "Unavailable" : undefined} />
        {providerLoading && !providers ? <ProviderLoading /> : cost ? <div><div className="px-5 py-4"><p className="text-label text-muted-foreground">Month to date</p><p className="mt-1 text-kpi tabular-nums">{money(cost.monthToDate, cost.currency)}</p><p className="mt-1 text-meta text-muted-foreground">Updated {dateTime.format(new Date(cost.refreshedAt))}{cost.stale ? " · cached snapshot" : ""}</p></div><div className="divide-y divide-border border-t border-border">{cost.byService.slice(0, 6).map((row) => <div key={row.service} className="flex items-center justify-between gap-3 px-5 py-2.5"><span className="truncate text-body">{row.service}</span><span className="shrink-0 text-body tabular-nums">{money(row.cost, cost.currency)}</span></div>)}</div></div> : <ProviderUnavailable reason={providers?.cost.status === "unavailable" ? providers.cost.reason : "Cost data is unavailable."} />}
      </section>
    </div>
  </WorkspacePage>
}
