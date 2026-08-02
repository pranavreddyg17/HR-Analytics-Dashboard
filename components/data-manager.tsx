"use client"

import { useEffect, useState } from "react"
import { Check, Clipboard, Download, RefreshCw, Upload } from "lucide-react"

import { apiBaseUrl } from "@/lib/api"
import { hrDomains, importFields, type DomainStatus, type HrDomain } from "@/lib/hr-types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { formatWorkspaceDateTime } from "@/lib/date-format"

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
  return matrix.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index]?.trim() ?? ""])))
}

async function copyToClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value)
      return
    } catch {
      // Some managed browsers block the async clipboard API. Use the
      // selection-based fallback below for the same user-initiated click.
    }
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

export function DataManager() {
  const [domain, setDomain] = useState<HrDomain>("employees")
  const [rows, setRows] = useState<Array<Record<string, string>>>([])
  const [filename, setFilename] = useState("")
  const [replace, setReplace] = useState(true)
  const [status, setStatus] = useState<DomainStatus[]>([])
  const [busy, setBusy] = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [copiedFeed, setCopiedFeed] = useState<HrDomain | null>(null)
  const [copyError, setCopyError] = useState("")

  async function refreshStatus() {
    setStatusBusy(true)
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/data/status`, { cache: "no-store" })
      if (!response.ok) throw new Error("Data status could not be refreshed.")
      setStatus((await response.json() as { status: DomainStatus[] }).status)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Data status could not be refreshed.")
    } finally {
      setStatusBusy(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${apiBaseUrl}/api/v1/data/status`, { cache: "no-store", signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<{ status: DomainStatus[] }> : null)
      .then((body) => { if (body) setStatus(body.status) })
      .catch(() => undefined)
    return () => controller.abort()
  }, [])

  async function loadFile(file: File | undefined) {
    if (!file) return
    setError(""); setMessage("")
    try {
      const parsed = parseCsv(await file.text())
      setRows(parsed); setFilename(file.name)
      const missing = importFields[domain].filter((field) => field !== "id" && !Object.hasOwn(parsed[0], field))
      if (missing.length) setError(`Missing columns for ${domain}: ${missing.join(", ")}`)
    } catch (reason) { setRows([]); setError(reason instanceof Error ? reason.message : "Unable to read CSV.") }
  }

  async function importRows() {
    if (!rows.length || error) return
    setBusy(true); setMessage(""); setError("")
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/data/import`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain, rows, filename, replace }) })
      const body = await response.json() as { imported?: number; error?: string }
      if (!response.ok) throw new Error(body.error ?? `Import failed (${response.status})`)
      setMessage(`Imported ${body.imported} ${domain} rows. Dashboards and reports now use the updated records.`)
      setRows([]); setFilename("")
      await refreshStatus()
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Import failed.") }
    finally { setBusy(false) }
  }

  async function copyPowerBiFeed(item: HrDomain) {
    const url = `${window.location.origin}${apiBaseUrl}/api/v1/power-bi/${item}`
    setCopyError("")
    try {
      await copyToClipboard(url)
      setCopiedFeed(item)
      window.setTimeout(() => setCopiedFeed((current) => current === item ? null : current), 2200)
    } catch (reason) {
      setCopiedFeed(null)
      setCopyError(reason instanceof Error ? reason.message : "The endpoint could not be copied.")
    }
  }

  const totalRows = status.reduce((sum, item) => sum + item.count, 0)
  return <div className="mx-auto flex w-full max-w-[1520px] flex-col gap-5 pb-10">
    <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Import / Export Data</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">Import HR records, download templates, and connect reporting feeds.</p>
      </div>
      <Button type="button" variant="outline" onClick={() => void refreshStatus()} disabled={statusBusy}>
        <RefreshCw className={cn("size-4", statusBusy && "animate-spin")} />
        Refresh status
      </Button>
    </header>

    <Card id="data-coverage" className="scroll-mt-24 gap-0 overflow-hidden py-0 shadow-none">
      <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div><CardTitle>Data coverage</CardTitle><CardDescription className="mt-1">Current records available to dashboards and reports</CardDescription></div>
        <div className="flex gap-5 text-sm">
          <div><span className="block text-[10px] text-muted-foreground">Total records</span><b className="font-semibold tabular-nums">{totalRows.toLocaleString()}</b></div>
          <div><span className="block text-[10px] text-muted-foreground">Data domains</span><b className="font-semibold tabular-nums">{hrDomains.length}</b></div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="bg-muted/45 text-xs text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Domain</th><th className="px-5 py-3 font-medium">Records</th><th className="px-5 py-3 font-medium">Last import</th></tr></thead>
          <tbody>{status.map((item) => <tr key={item.domain} className="border-t border-border/70">
            <td className="px-5 py-3 font-medium capitalize">{item.domain}</td>
            <td className="px-5 py-3 tabular-nums">{item.count.toLocaleString()}</td>
            <td className="px-5 py-3 text-xs text-muted-foreground">{item.lastImport ? formatWorkspaceDateTime(item.lastImport) : "—"}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </Card>

    <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
      <Card id="import-records" className="scroll-mt-24 shadow-none">
        <CardHeader className="border-b border-border"><CardTitle>Import records</CardTitle><CardDescription>Select a domain and upload a CSV using the required template.</CardDescription></CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs text-muted-foreground">Domain<select value={domain} onChange={(event)=>{setDomain(event.target.value as HrDomain);setRows([]);setFilename("");setError("");setMessage("")}} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground">{hrDomains.map((item)=><option key={item} value={item}>{item[0].toUpperCase()+item.slice(1)}</option>)}</select></label>
            <div className="flex items-end"><a className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm hover:bg-muted" href={`${apiBaseUrl}/api/v1/data/template?domain=${domain}`}><Download className="size-4"/>Download template</a></div>
          </div>
          <div className="rounded-md border border-dashed border-input p-6">
            <label className="flex cursor-pointer flex-col items-center gap-2 text-center"><span className="text-sm font-medium">Choose a CSV file</span><span className="text-xs text-muted-foreground">Maximum 5,000 rows</span><input type="file" accept=".csv,text/csv" className="sr-only" onChange={(event)=>void loadFile(event.target.files?.[0])}/></label>
          </div>
          <div className="rounded-md bg-muted/40 p-3"><p className="text-xs font-medium">Required columns</p><p className="mt-1 font-mono text-[11px] leading-relaxed text-muted-foreground">{importFields[domain].join(", ")}</p></div>
          {rows.length > 0 && <div className="rounded-md border border-border p-3"><div className="flex items-center gap-2"><span className="text-sm font-medium">{filename}</span><span className="ml-auto font-mono text-xs">{rows.length} rows</span></div><div className="mt-3 overflow-x-auto"><table className="min-w-full text-left text-[11px]"><thead><tr>{Object.keys(rows[0]).slice(0,6).map((key)=><th key={key} className="border-b px-2 py-1.5 text-muted-foreground">{key}</th>)}</tr></thead><tbody>{rows.slice(0,3).map((row,index)=><tr key={index}>{Object.keys(rows[0]).slice(0,6).map((key)=><td key={key} className="max-w-36 truncate border-b border-border/50 px-2 py-1.5">{row[key]}</td>)}</tr>)}</tbody></table></div></div>}
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={replace} onChange={(event)=>setReplace(event.target.checked)} className="mt-1 accent-primary"/><span><b>Replace this domain</b><span className="block text-xs text-muted-foreground">Recommended for full HRIS refresh files. Turn off to upsert by ID while preserving other imported rows.</span></span></label>
          {error && <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-destructive/10 p-3 text-xs text-destructive">{error}</pre>}
          {message && <p className="rounded-md bg-success/10 p-3 text-sm text-success">{message}</p>}
          <Button onClick={()=>void importRows()} disabled={!rows.length || Boolean(error) || busy}>{busy?<RefreshCw className="size-4 animate-spin"/>:<Upload className="size-4"/>}{busy?"Importing…":`Import ${rows.length || ""} rows`}</Button>
        </CardContent>
      </Card>

      <Card id="power-bi-feeds" className="h-fit scroll-mt-24 shadow-none">
        <CardHeader className="border-b border-border">
          <CardTitle>Power BI feeds</CardTitle>
          <CardDescription>Copy a CSV endpoint for scheduled reporting.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {hrDomains.map((item) => {
            const copied = copiedFeed === item
            return (
              <button
                type="button"
                key={item}
                onClick={() => void copyPowerBiFeed(item)}
                className="group flex w-full items-center gap-3 rounded-md border border-border p-3 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                aria-label={`Copy ${item} Power BI endpoint`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium capitalize">{item}</span>
                  <span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground">/api/v1/power-bi/{item}</span>
                </span>
                <span className={cn("flex items-center gap-1.5 text-xs font-medium", copied ? "text-success" : "text-muted-foreground group-hover:text-primary")}>
                  {copied ? <Check className="size-3.5" /> : <Clipboard className="size-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </span>
              </button>
            )
          })}
          <p aria-live="polite" className={cn("pt-2 text-[11px] leading-5", copyError ? "text-destructive" : "text-muted-foreground")}>
            {copyError || "Use an authenticated Power BI Web connector or gateway for scheduled refreshes."}
          </p>
        </CardContent>
      </Card>
    </div>
  </div>
}
