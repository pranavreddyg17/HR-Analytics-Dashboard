"use client"

import { useMemo, useState } from "react"
import { ChevronDown, Search } from "lucide-react"

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { RiskBadge } from "@/components/risk-badge"
import { cn } from "@/lib/utils"
import type { Employee, RiskLevel } from "@/lib/types"

const filters: { key: RiskLevel | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "high", label: "High" },
  { key: "medium", label: "Medium" },
  { key: "low", label: "Low" },
]

function riskBarColor(level: RiskLevel) {
  return level === "high" ? "var(--destructive)" : level === "medium" ? "var(--warning)" : "var(--success)"
}

const pageSize = 25

export function EmployeesClient({ employees, total }: { employees: Employee[]; total: number }) {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<RiskLevel | "all">("all")
  const [openId, setOpenId] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  const counts = useMemo(() => employees.reduce<Record<RiskLevel | "all", number>>((result, employee) => {
    result.all += 1
    result[employee.riskLevel] += 1
    return result
  }, { all: 0, high: 0, medium: 0, low: 0 }), [employees])

  const filteredRows = useMemo(() => {
    return employees
      .filter((employee) => (filter === "all" ? true : employee.riskLevel === filter))
      .filter((employee) =>
        query
          ? `${employee.id} ${employee.department} ${employee.role}`.toLowerCase().includes(query.toLowerCase())
          : true,
      )
      .sort((a, b) => b.riskScore - a.riskScore)
  }, [employees, query, filter])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const rows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const firstVisible = filteredRows.length ? (currentPage - 1) * pageSize + 1 : 0
  const lastVisible = Math.min(currentPage * pageSize, filteredRows.length)

  return (
    <div className="flex flex-col gap-4">
      <Card className="gap-0 overflow-hidden py-0">
        <CardHeader className="flex flex-col gap-4 border-b sm:flex-row sm:items-center">
          <div>
            <CardTitle>Model-scored records</CardTitle>
            <CardDescription>
              {filteredRows.length.toLocaleString()} matching of {total.toLocaleString()} scored records
            </CardDescription>
          </div>
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => { setQuery(event.target.value); setPage(1); setOpenId(null) }}
                placeholder="Search ID, role, or department..."
                className="h-9 bg-background pl-8 sm:w-64"
              />
            </div>
            <div className="flex items-center border-b border-border">
              {filters.map((item) => (
                <button
                  type="button"
                  key={item.key}
                  onClick={() => { setFilter(item.key); setPage(1); setOpenId(null) }}
                  className={cn(
                    "-mb-px border-b-2 px-2.5 py-2 text-xs font-semibold transition-colors",
                    filter === item.key
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item.label} <span className="ml-1 tabular-nums opacity-70">{counts[item.key].toLocaleString()}</span>
                </button>
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="hidden grid-cols-[1.4fr_1fr_1.4fr_0.9fr_auto] gap-4 bg-muted/35 px-5 py-3 text-xs font-semibold text-muted-foreground md:grid">
            <span>Record</span>
            <span>Department</span>
            <span>Top model signal</span>
            <span>Risk score</span>
            <span className="sr-only">Details</span>
          </div>

          {rows.map((employee) => {
            const open = openId === employee.id
            return (
              <div key={employee.id} className="border-b border-border last:border-b-0">
                <div className="grid grid-cols-1 items-center gap-3 px-4 py-3 md:grid-cols-[1.4fr_1fr_1.4fr_0.9fr_auto] md:gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{employee.id}</p>
                    <p className="truncate text-xs text-muted-foreground">{employee.role}</p>
                  </div>

                  <div className="flex flex-col text-sm">
                    <span>{employee.department}</span>
                    <span className="text-xs text-muted-foreground">${employee.monthlyIncome.toLocaleString()} monthly income</span>
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

                  <Button variant="outline" size="sm" onClick={() => setOpenId(open ? null : employee.id)}>
                    Review
                    <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
                  </Button>
                </div>

                {open && (
                  <div className="border-t border-border bg-muted/25 px-4 py-3">
                      <div>
                        <p className="text-xs font-semibold">Review guidance</p>
                        <p className="mt-1 text-sm text-pretty">{employee.suggestion}</p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Tenure: {employee.tenure} · Job satisfaction: {employee.jobSatisfaction}/4 · Work-life balance: {employee.workLifeBalance}/4 · Historical outcome: {employee.observedAttrition}
                        </p>
                      </div>
                  </div>
                )}
              </div>
            )
          })}

          {rows.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">No records match your filters.</p>
          )}
          {filteredRows.length > 0 && (
            <div className="flex flex-col gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                Showing {firstVisible.toLocaleString()}–{lastVisible.toLocaleString()} of {filteredRows.length.toLocaleString()} matching records
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => { setPage((value) => Math.max(1, value - 1)); setOpenId(null) }}>
                  Previous
                </Button>
                <span className="min-w-20 text-center text-xs tabular-nums text-muted-foreground">Page {currentPage} of {totalPages}</span>
                <Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => { setPage((value) => Math.min(totalPages, value + 1)); setOpenId(null) }}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
