"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, Clipboard, Database, Download, FileSpreadsheet, RefreshCw, ShieldCheck, Upload } from "lucide-react"

import { apiBaseUrl } from "@/lib/api"
import { hrDomains, importFields, type DomainStatus, type HrDomain } from "@/lib/hr-types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

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

export function DataManager() {
  const [domain, setDomain] = useState<HrDomain>("employees")
  const [rows, setRows] = useState<Array<Record<string, string>>>([])
  const [filename, setFilename] = useState("")
  const [replace, setReplace] = useState(true)
  const [status, setStatus] = useState<DomainStatus[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  async function refreshStatus() {
    const response = await fetch(`${apiBaseUrl}/api/v1/data/status`, { cache: "no-store" })
    if (response.ok) setStatus((await response.json() as { status: DomainStatus[] }).status)
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
      setMessage(`Imported ${body.imported} ${domain} rows. Dashboards, AI tools, exports, and Power BI feeds now use them.`)
      setRows([]); setFilename("")
      await refreshStatus()
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Import failed.") }
    finally { setBusy(false) }
  }

  const origin = typeof window === "undefined" ? "" : window.location.origin
  return <div className="flex flex-col gap-5">
    <div className="grid gap-4 md:grid-cols-3">{status.map((item)=><Card key={item.domain} className="gap-2 p-4"><div className="flex items-center gap-2"><span className={cn("size-2.5 rounded-full",item.mode==="imported"?"bg-success":item.mode==="demo"?"bg-warning":"bg-muted-foreground")}/><span className="text-sm font-medium capitalize">{item.domain}</span><span className="ml-auto text-[10px] uppercase text-muted-foreground">{item.mode}</span></div><p className="font-mono text-2xl font-semibold">{item.count.toLocaleString()}</p><p className="text-xs text-muted-foreground">{item.lastImport ? `Last import ${new Date(item.lastImport).toLocaleString()}` : "Sample records active"}</p></Card>)}</div>

    <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Upload className="size-4 text-primary"/>Import HR data</CardTitle><CardDescription>One CSV per domain. Fields are validated before D1 is changed; imported data never leaves this application.</CardDescription></CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs text-muted-foreground">Domain<select value={domain} onChange={(event)=>{setDomain(event.target.value as HrDomain);setRows([]);setFilename("");setError("");setMessage("")}} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground">{hrDomains.map((item)=><option key={item} value={item}>{item[0].toUpperCase()+item.slice(1)}</option>)}</select></label>
            <div className="flex items-end"><a className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm hover:bg-muted" href={`${apiBaseUrl}/api/v1/data/template?domain=${domain}`}><Download className="size-4"/>Download {domain} template</a></div>
          </div>
          <div className="rounded-xl border border-dashed border-primary/30 bg-primary/5 p-5">
            <label className="flex cursor-pointer flex-col items-center gap-2 text-center"><FileSpreadsheet className="size-8 text-primary"/><span className="text-sm font-medium">Choose a CSV file</span><span className="text-xs text-muted-foreground">Up to 5,000 rows per import · UTF-8 · quoted fields supported</span><input type="file" accept=".csv,text/csv" className="sr-only" onChange={(event)=>void loadFile(event.target.files?.[0])}/></label>
          </div>
          <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs font-medium">Required columns</p><p className="mt-1 font-mono text-[11px] leading-relaxed text-muted-foreground">{importFields[domain].join(", ")}</p></div>
          {rows.length > 0 && <div className="rounded-lg border border-border p-3"><div className="flex items-center gap-2"><CheckCircle2 className="size-4 text-success"/><span className="text-sm font-medium">{filename}</span><span className="ml-auto font-mono text-xs">{rows.length} rows</span></div><div className="mt-3 overflow-x-auto"><table className="min-w-full text-left text-[11px]"><thead><tr>{Object.keys(rows[0]).slice(0,6).map((key)=><th key={key} className="border-b px-2 py-1.5 text-muted-foreground">{key}</th>)}</tr></thead><tbody>{rows.slice(0,3).map((row,index)=><tr key={index}>{Object.keys(rows[0]).slice(0,6).map((key)=><td key={key} className="max-w-36 truncate border-b border-border/50 px-2 py-1.5">{row[key]}</td>)}</tr>)}</tbody></table></div></div>}
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={replace} onChange={(event)=>setReplace(event.target.checked)} className="mt-1 accent-primary"/><span><b>Replace this domain</b><span className="block text-xs text-muted-foreground">Recommended for full HRIS refresh files. Turn off to upsert by ID while preserving other imported rows.</span></span></label>
          {error && <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-destructive/10 p-3 text-xs text-destructive">{error}</pre>}
          {message && <p className="rounded-lg bg-success/10 p-3 text-sm text-success">{message}</p>}
          <Button onClick={()=>void importRows()} disabled={!rows.length || Boolean(error) || busy}>{busy?<RefreshCw className="size-4 animate-spin"/>:<Upload className="size-4"/>}{busy?"Importing…":`Import ${rows.length || ""} rows`}</Button>
        </CardContent>
      </Card>

      <div className="space-y-5">
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Database className="size-4 text-primary"/>Power BI refresh feeds</CardTitle><CardDescription>Use Web/CSV connectors. Each endpoint reads the latest D1 records and accepts the dashboard filter query parameters.</CardDescription></CardHeader><CardContent className="space-y-2">{hrDomains.map((item)=>{const url=`${origin}${apiBaseUrl}/api/v1/power-bi/${item}`;return <button key={item} onClick={()=>void navigator.clipboard.writeText(url)} className="group flex w-full items-center gap-2 rounded-lg border border-border p-2.5 text-left hover:bg-muted"><span className="flex-1 truncate font-mono text-[11px]">/api/v1/power-bi/{item}</span><Clipboard className="size-3.5 text-muted-foreground group-hover:text-primary"/></button>})}<p className="pt-2 text-[11px] text-muted-foreground">This site is private. Configure the corresponding authenticated Web connector or gateway in Power BI before scheduling refreshes.</p></CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="size-4 text-success"/>Data handling</CardTitle></CardHeader><CardContent className="space-y-2 text-sm text-muted-foreground"><p>Imports are validated and written to the app&apos;s persistent Cloudflare D1 database.</p><p>Demo rows are labelled <code>data_source=demo</code>; imported rows are labelled <code>imported</code>.</p><p>The default agent path synthesizes results locally. External LLM use only activates when an administrator configures an OpenAI API secret.</p></CardContent></Card>
      </div>
    </div>
  </div>
}
