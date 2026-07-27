"use client"

import { useMemo, useState } from "react"
import { Search, Sparkles, ChevronDown, DollarSign, Database, Loader2 } from "lucide-react"

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { RiskBadge } from "@/components/risk-badge"
import { apiBaseUrl } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { Employee, RiskLevel } from "@/lib/types"

const filters: { key: RiskLevel | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "high", label: "High" },
  { key: "medium", label: "Medium" },
  { key: "low", label: "Low" },
]

function riskBarColor(level: RiskLevel) {
  return level === "high" ? "var(--chart-3)" : level === "medium" ? "var(--chart-2)" : "var(--chart-1)"
}

export function EmployeesClient({ employees, total }: { employees: Employee[]; total: number }) {
  const [records, setRecords] = useState(employees)
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<RiskLevel | "all">("all")
  const [openId, setOpenId] = useState<string | null>(employees[0]?.id ?? null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const rows = useMemo(() => {
    return records
      .filter((employee) => (filter === "all" ? true : employee.riskLevel === filter))
      .filter((employee) =>
        query
          ? `${employee.id} ${employee.department} ${employee.role}`.toLowerCase().includes(query.toLowerCase())
          : true,
      )
      .sort((a, b) => b.riskScore - a.riskScore)
  }, [records, query, filter])

  async function loadMore() {
    setLoadingMore(true)
    setLoadError(null)
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/employees?limit=250&offset=${records.length}`)
      if (!response.ok) throw new Error(`Could not load records (${response.status})`)
      const body = await response.json() as { items: Employee[] }
      setRecords((current) => [...current, ...body.items])
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : "Could not load more records.")
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-2 rounded-xl border border-warning/25 bg-warning/10 p-3 text-sm text-warning">
        <Database className="mt-0.5 size-4 shrink-0" />
        <p>
          These are anonymised rows from the historical training dataset, not live employees. The source file contains no names, job titles, managers, or locations.
        </p>
      </div>

      <Card>
        <CardHeader className="flex-col gap-4 border-b sm:flex-row sm:items-center">
          <div>
            <CardTitle>Model-scored records</CardTitle>
            <CardDescription>
              {rows.length.toLocaleString()} matching · {records.length.toLocaleString()} of {total.toLocaleString()} records loaded
            </CardDescription>
          </div>
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search ID or department..."
                className="h-9 bg-background pl-8 sm:w-64"
              />
            </div>
            <div className="flex items-center gap-1 rounded-lg bg-secondary p-0.5">
              {filters.map((item) => (
                <button
                  key={item.key}
                  onClick={() => setFilter(item.key)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    filter === item.key
                      ? "bg-card text-foreground ring-1 ring-border"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-2">
          <div className="hidden grid-cols-[1.4fr_1fr_1.4fr_0.9fr_auto] gap-4 px-3 pb-1 text-xs font-medium text-muted-foreground md:grid">
            <span>Record</span>
            <span>Department</span>
            <span>Top model signal</span>
            <span>Risk score</span>
            <span className="sr-only">Details</span>
          </div>

          {rows.map((employee) => {
            const open = openId === employee.id
            return (
              <div key={employee.id} className="rounded-lg bg-muted/40 ring-1 ring-border/60">
                <div className="grid grid-cols-1 items-center gap-3 p-3 md:grid-cols-[1.4fr_1fr_1.4fr_0.9fr_auto] md:gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary">
                      {employee.id.slice(-4)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{employee.id}</p>
                      <p className="truncate text-xs text-muted-foreground">{employee.role}</p>
                    </div>
                  </div>

                  <div className="flex flex-col text-sm">
                    <span>{employee.department}</span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <DollarSign className="size-3" />
                      ${employee.monthlyIncome.toLocaleString()}/month
                    </span>
                  </div>

                  <p className="text-sm text-muted-foreground">{employee.topDriver}</p>

                  <div className="flex items-center gap-2.5">
                    <div className="flex flex-col gap-1">
                      <span className="font-mono text-sm font-semibold tabular-nums">{employee.riskScore.toFixed(1)}%</span>
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-secondary">
                        <div className="h-full rounded-full" style={{ width: `${employee.riskScore}%`, background: riskBarColor(employee.riskLevel) }} />
                      </div>
                    </div>
                    <RiskBadge level={employee.riskLevel} />
                  </div>

                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setOpenId(open ? null : employee.id)}>
                    <Sparkles className="size-3.5 text-primary" />
                    Review
                    <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
                  </Button>
                </div>

                {open && (
                  <div className="border-t border-border/60 bg-primary/5 p-3">
                    <div className="flex items-start gap-2.5">
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                        <Sparkles className="size-3.5" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-medium text-primary">Human-review recommendation</p>
                        <p className="mt-1 text-sm text-pretty">{employee.suggestion}</p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Tenure: {employee.tenure} · Job satisfaction: {employee.jobSatisfaction}/4 · Work-life balance: {employee.workLifeBalance}/4 · Historical outcome: {employee.observedAttrition}
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          The historical outcome is shown for audit purposes. The score must not be used as the sole basis for an employment action.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {rows.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">No records match your filters.</p>
          )}
          {records.length < total && (
            <div className="flex flex-col items-center gap-2 pt-2">
              <Button variant="outline" disabled={loadingMore} onClick={() => void loadMore()}>
                {loadingMore && <Loader2 className="size-4 animate-spin" />}
                Load more records
              </Button>
              {loadError && <p role="alert" className="text-sm text-destructive">{loadError}</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
