"use client"

import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"

import type { DataStatusResponse, ImportMode, ImportPreview } from "@/lib/data-import-types"
import { hrDomains, importFields, type HrDomain } from "@/lib/hr-types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { formatWorkspaceDateTime } from "@/lib/date-format"
import { WorkspaceHeader, WorkspacePage } from "@/components/workspace-ui"
import { IntegrationApiManager } from "@/components/integration-api-manager"
import { RegisterPagination } from "@/components/register-pagination"

function parseCsv(text: string): Array<Record<string, string>> {
  const matrix: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index += 1 }
      else quoted = !quoted
    } else if (character === "," && !quoted) { row.push(cell); cell = "" }
    else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1
      row.push(cell); cell = ""
      if (row.some((value) => value.trim())) matrix.push(row)
      row = []
    } else cell += character
  }
  row.push(cell)
  if (row.some((value) => value.trim())) matrix.push(row)
  if (quoted) throw new Error("CSV contains an unclosed quoted field.")
  if (matrix.length < 2) throw new Error("CSV must contain a header and at least one data row.")
  const headers = matrix[0].map((header) => header.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""))
  if (new Set(headers).size !== headers.length) throw new Error("CSV contains duplicate column names.")
  return matrix.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""])))
}

async function copyToClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(value); return } catch { /* use fallback */ }
  }
  const textArea = document.createElement("textarea")
  textArea.value = value
  textArea.setAttribute("readonly", "")
  textArea.style.position = "fixed"
  textArea.style.left = "-9999px"
  document.body.appendChild(textArea)
  textArea.select()
  const copied = document.execCommand("copy")
  textArea.remove()
  if (!copied) throw new Error("Copy was blocked by the browser.")
}

const emptyStatus: DataStatusResponse = {
  generatedAt: "",
  status: [],
  imports: [],
  summary: { totalRecords: 0, completedImports: 0, failedImports: 0, lastCompletedAt: null },
}

function domainLabel(domain: HrDomain): string {
  return domain === "leave" ? "Leave" : domain[0].toUpperCase() + domain.slice(1)
}

function modeLabel(mode: ImportMode): string {
  return mode === "merge" ? "Merge" : "Replace imported"
}

export function DataManager({ canManageApi }: { canManageApi: boolean }) {
  const searchParams = useSearchParams()
  const requestedView = searchParams.get("view")
  const view = requestedView === "feeds" ? "feeds" : requestedView === "api" ? "api" : "imports"
  const fileInput = useRef<HTMLInputElement>(null)
  const [domain, setDomain] = useState<HrDomain>("employees")
  const [mode, setMode] = useState<ImportMode>("merge")
  const [rows, setRows] = useState<Array<Record<string, string>>>([])
  const [filename, setFilename] = useState("")
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [previewRevision, setPreviewRevision] = useState(0)
  const [replaceConfirmed, setReplaceConfirmed] = useState(false)
  const [dataStatus, setDataStatus] = useState<DataStatusResponse>(emptyStatus)
  const [busy, setBusy] = useState<"status" | "validate" | "apply" | null>(null)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [copiedFeed, setCopiedFeed] = useState<HrDomain | null>(null)

  async function refreshStatus() {
    setBusy("status")
    try {
      const response = await fetch("/api/v1/data/status", { cache: "no-store" })
      const body = await response.json() as DataStatusResponse & { error?: string }
      if (!response.ok) throw new Error(body.error ?? "Data status could not be refreshed.")
      setDataStatus(body)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Data status could not be refreshed.")
    } finally {
      setBusy(null)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/v1/data/status", { cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<DataStatusResponse> : null)
      .then((body) => { if (body) setDataStatus(body) })
      .catch(() => undefined)
    return () => controller.abort()
  }, [])

  function resetFile() {
    setRows([])
    setFilename("")
    setPreview(null)
    setReplaceConfirmed(false)
    if (fileInput.current) fileInput.current.value = ""
  }

  async function loadFile(file: File | undefined) {
    resetFile()
    setError("")
    setMessage("")
    if (!file) return
    try {
      const parsed = parseCsv(await file.text())
      if (parsed.length > 5000) throw new Error("CSV files are limited to 5,000 data rows.")
      setRows(parsed)
      setFilename(file.name)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to read CSV.")
    }
  }

  async function submit(action: "validate" | "apply") {
    if (!rows.length) return
    setBusy(action)
    setError("")
    setMessage("")
    try {
      const response = await fetch("/api/v1/data/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, domain, rows, filename, mode }),
      })
      const body = await response.json() as { imported?: number; preview?: ImportPreview; error?: string }
      if (body.preview) {
        setPreview(body.preview)
        setPreviewRevision((current) => current + 1)
      }
      if (!response.ok) throw new Error(body.error ?? `Import request failed (${response.status}).`)
      if (action === "validate") return
      setMessage(`${body.imported?.toLocaleString() ?? rows.length.toLocaleString()} ${domainLabel(domain).toLowerCase()} records imported.`)
      resetFile()
      await refreshStatus()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Import request failed.")
    } finally {
      setBusy(null)
    }
  }

  async function copyFeed(item: HrDomain) {
    setError("")
    try {
      await copyToClipboard(`${window.location.origin}/api/v1/power-bi/${item}`)
      setCopiedFeed(item)
      window.setTimeout(() => setCopiedFeed((current) => current === item ? null : current), 2000)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The endpoint could not be copied.")
    }
  }

  const canApply = Boolean(preview?.canApply) && (mode === "merge" || replaceConfirmed)
  return <WorkspacePage>
    <WorkspaceHeader
      title="Import / export data"
      description="Data ingestion and reporting feeds."
      meta={<>{dataStatus.summary.totalRecords.toLocaleString()} records</>}
      actions={<Button type="button" variant="outline" onClick={() => void refreshStatus()} disabled={busy !== null}>Refresh</Button>}
    />

    <nav aria-label="Data workspace" className="flex gap-5 border-b border-border">
      <a href="/imports" className={cn("border-b-2 px-1 pb-2 text-body", view === "imports" ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>Imports</a>
      <a href="/imports?view=feeds" className={cn("border-b-2 px-1 pb-2 text-body", view === "feeds" ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>Reporting feeds</a>
      <a href="/imports?view=api" className={cn("border-b-2 px-1 pb-2 text-body", view === "api" ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>Integration API</a>
    </nav>

    {view === "api" ? <IntegrationApiManager canManage={canManageApi} /> : view === "imports" ? <>
      <section className="grid gap-3 sm:grid-cols-3" aria-label="Import summary">
        <div className="rounded-md border border-border bg-card px-4 py-3"><p className="text-meta text-muted-foreground">Records</p><p className="mt-1 text-kpi tabular-nums">{dataStatus.summary.totalRecords.toLocaleString()}</p></div>
        <div className="rounded-md border border-border bg-card px-4 py-3"><p className="text-meta text-muted-foreground">Last completed import</p><p className="mt-1 text-card-title">{dataStatus.summary.lastCompletedAt ? formatWorkspaceDateTime(dataStatus.summary.lastCompletedAt) : "None"}</p></div>
        <div className="rounded-md border border-border bg-card px-4 py-3"><p className="text-meta text-muted-foreground">Failed imports</p><p className="mt-1 text-kpi tabular-nums">{dataStatus.summary.failedImports.toLocaleString()}</p></div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <Card className="shadow-none">
          <CardHeader className="border-b border-border"><CardTitle>New import</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-label">Domain
                <select value={domain} onChange={(event) => { setDomain(event.target.value as HrDomain); resetFile(); setError(""); setMessage("") }} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-body text-foreground">
                  {hrDomains.map((item) => <option key={item} value={item}>{domainLabel(item)}</option>)}
                </select>
              </label>
              <label className="text-label">Import method
                <select value={mode} onChange={(event) => { setMode(event.target.value as ImportMode); setPreview(null); setReplaceConfirmed(false) }} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-body text-foreground">
                  <option value="merge">Merge by ID</option>
                  <option value="replace_imported">Replace imported records</option>
                </select>
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex h-9 cursor-pointer items-center rounded-md border border-input bg-background px-3 text-button hover:bg-muted">
                Choose CSV
                <input ref={fileInput} type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => void loadFile(event.target.files?.[0])} />
              </label>
              <a className="inline-flex h-9 items-center rounded-md px-3 text-button text-primary hover:bg-muted" href={`/api/v1/data/template?domain=${domain}`}>Download template</a>
              <span className="text-meta text-muted-foreground">Up to 5,000 rows</span>
            </div>
            {filename ? <div className="rounded-md border border-border px-3 py-2 text-body"><span className="font-semibold">{filename}</span><span className="ml-2 text-muted-foreground">{rows.length.toLocaleString()} rows</span></div> : null}

            {rows.length > 0 ? <div className="flex gap-2">
              <Button type="button" onClick={() => void submit("validate")} disabled={busy !== null}>{busy === "validate" ? "Validating…" : "Validate file"}</Button>
              <Button type="button" variant="ghost" onClick={resetFile} disabled={busy !== null}>Remove</Button>
            </div> : null}

            {preview ? <section className="space-y-3 rounded-md border border-border p-4" aria-label="Validation result">
              <div className="flex items-start justify-between gap-4"><div><h3 className="text-subsection-heading">Validation result</h3><p className="text-meta text-muted-foreground">{preview.canApply ? "Ready to import" : "Resolve errors and validate again"}</p></div><span className={cn("rounded-sm px-2 py-0.5 text-status", preview.canApply ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>{preview.canApply ? "Passed" : "Failed"}</span></div>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div><dt className="text-meta text-muted-foreground">Rows</dt><dd className="text-card-title tabular-nums">{preview.totalRows.toLocaleString()}</dd></div>
                <div><dt className="text-meta text-muted-foreground">New</dt><dd className="text-card-title tabular-nums">{preview.inserts.toLocaleString()}</dd></div>
                <div><dt className="text-meta text-muted-foreground">Updates</dt><dd className="text-card-title tabular-nums">{preview.updates.toLocaleString()}</dd></div>
                <div><dt className="text-meta text-muted-foreground">Errors</dt><dd className="text-card-title tabular-nums">{preview.issues.filter((item) => item.severity === "error").length.toLocaleString()}</dd></div>
              </dl>
              {preview.issues.length ? <div className="overflow-hidden border-t border-border">
                <RegisterPagination
                  rows={preview.issues}
                  itemLabel="issues"
                  resetKey={`${domain}|${filename}|${previewRevision}`}
                  initialPageSize={10}
                >
                  {(pageIssues) => <div className="max-h-44 overflow-auto pt-2">{pageIssues.map((issue, index) => <p key={`${issue.code}-${issue.row ?? 0}-${index}`} className={cn("py-1 text-meta", issue.severity === "error" ? "text-destructive" : "text-warning")}><span className="font-semibold">{issue.severity === "error" ? "Error" : "Warning"}{issue.row ? ` · row ${issue.row}` : ""}</span> — {issue.message}</p>)}</div>}
                </RegisterPagination>
              </div> : null}
              {mode === "replace_imported" && preview.canApply ? <label className="flex items-start gap-2 border-t border-border pt-3 text-body"><input type="checkbox" checked={replaceConfirmed} onChange={(event) => setReplaceConfirmed(event.target.checked)} className="mt-1 accent-primary" /><span>Replace {preview.replacedRows.toLocaleString()} existing imported {domainLabel(domain).toLowerCase()} records. Manually created and sample records are preserved.</span></label> : null}
              <Button type="button" onClick={() => void submit("apply")} disabled={!canApply || busy !== null}>{busy === "apply" ? "Importing…" : "Import records"}</Button>
            </section> : null}

            {error ? <p className="rounded-md bg-destructive/10 px-3 py-2 text-body text-destructive" role="alert">{error}</p> : null}
            {message ? <p className="rounded-md bg-success/10 px-3 py-2 text-body text-success" role="status">{message}</p> : null}
            <details className="border-t border-border pt-3"><summary className="cursor-pointer text-card-title">CSV columns</summary><p className="mt-2 break-words text-meta text-muted-foreground">{importFields[domain].join(", ")}</p></details>
          </CardContent>
        </Card>

        <Card className="h-fit shadow-none">
          <CardHeader className="border-b border-border"><CardTitle>Recent imports</CardTitle></CardHeader>
          <CardContent className="p-0">
            {dataStatus.imports.length ? <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left">
              <thead><tr className="border-b border-border bg-muted/35 text-label text-muted-foreground"><th className="px-4 py-2">File</th><th className="px-4 py-2">Method</th><th className="px-4 py-2">Rows</th><th className="px-4 py-2">Status</th></tr></thead>
              <tbody>{dataStatus.imports.map((item) => <tr key={item.id} className="border-b border-border/70 last:border-b-0"><td className="px-4 py-2"><span className="block max-w-48 truncate text-body font-semibold">{item.filename}</span><span className="text-meta text-muted-foreground">{domainLabel(item.domain)} · {formatWorkspaceDateTime(item.startedAt)}</span></td><td className="px-4 py-2 text-body">{modeLabel(item.mode)}</td><td className="px-4 py-2 text-body tabular-nums">{item.rowCount.toLocaleString()}</td><td className="px-4 py-2"><span className={cn("rounded-sm px-2 py-0.5 text-status", item.status === "completed" ? "bg-success/10 text-success" : item.status === "failed" ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning")}>{item.status}</span></td></tr>)}</tbody>
            </table></div> : <p className="p-4 text-body text-muted-foreground">No imports recorded.</p>}
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-none">
        <CardHeader className="border-b border-border"><CardTitle>Domain records</CardTitle></CardHeader>
        <CardContent className="p-0"><div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left">
          <thead><tr className="border-b border-border bg-muted/35 text-label text-muted-foreground"><th className="px-4 py-2">Domain</th><th className="px-4 py-2">Records</th><th className="px-4 py-2">Last import</th></tr></thead>
          <tbody>{dataStatus.status.map((item) => <tr key={item.domain} className="border-b border-border/70 last:border-b-0"><td className="px-4 py-2 text-body font-semibold">{domainLabel(item.domain)}</td><td className="px-4 py-2 text-body tabular-nums">{item.count.toLocaleString()}</td><td className="px-4 py-2 text-body text-muted-foreground">{item.lastImport ? formatWorkspaceDateTime(item.lastImport) : "—"}</td></tr>)}</tbody>
        </table></div></CardContent>
      </Card>
    </> : <Card className="shadow-none">
      <CardHeader className="border-b border-border"><CardTitle>Power BI feeds</CardTitle></CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left">
          <thead><tr className="border-b border-border bg-muted/35 text-label text-muted-foreground"><th className="px-4 py-2">Domain</th><th className="px-4 py-2">Records</th><th className="px-4 py-2">Format</th><th className="px-4 py-2">Endpoint</th><th className="px-4 py-2">Actions</th></tr></thead>
          <tbody>{hrDomains.map((item) => <tr key={item} className="border-b border-border/70 last:border-b-0"><td className="px-4 py-3 text-body font-semibold">{domainLabel(item)}</td><td className="px-4 py-3 text-body tabular-nums">{(dataStatus.status.find((entry) => entry.domain === item)?.count ?? 0).toLocaleString()}</td><td className="px-4 py-3 text-body">CSV</td><td className="px-4 py-3 font-mono text-meta text-muted-foreground">/api/v1/power-bi/{item}</td><td className="px-4 py-3"><div className="flex gap-3"><button type="button" className="text-button text-primary hover:underline" onClick={() => void copyFeed(item)}>{copiedFeed === item ? "Copied" : "Copy"}</button><a className="text-button text-primary hover:underline" href={`/api/v1/power-bi/${item}`}>Open</a></div></td></tr>)}</tbody>
        </table></div>
        <p className="border-t border-border px-4 py-3 text-meta text-muted-foreground">Authenticated CSV endpoints. Scheduled refresh requires an authenticated Power BI connector or gateway.</p>
      </CardContent>
    </Card>}
  </WorkspacePage>
}
