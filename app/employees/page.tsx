"use client"

import { useMemo, useState } from "react"
import { Search, Sparkles, ChevronDown, Check, X, MapPin } from "lucide-react"

import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { RiskBadge } from "@/components/risk-badge"
import { cn } from "@/lib/utils"
import { employees, type RiskLevel } from "@/lib/data"

const filters: { key: RiskLevel | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "high", label: "High" },
  { key: "medium", label: "Medium" },
  { key: "low", label: "Low" },
]

function riskBarColor(level: RiskLevel) {
  return level === "high" ? "var(--chart-3)" : level === "medium" ? "var(--chart-2)" : "var(--chart-1)"
}

export default function EmployeesPage() {
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<RiskLevel | "all">("all")
  const [openId, setOpenId] = useState<string | null>("E-2041")

  const rows = useMemo(() => {
    return employees
      .filter((e) => (filter === "all" ? true : e.riskLevel === filter))
      .filter((e) =>
        query
          ? `${e.name} ${e.role} ${e.department}`.toLowerCase().includes(query.toLowerCase())
          : true,
      )
      .sort((a, b) => b.riskScore - a.riskScore)
  }, [query, filter])

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader className="flex-col gap-4 border-b sm:flex-row sm:items-center">
          <div>
            <CardTitle>Retention worklist</CardTitle>
            <CardDescription>
              {rows.length} people · sorted by predicted attrition risk
            </CardDescription>
          </div>
          <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search people..."
                className="h-9 bg-background pl-8 sm:w-56"
              />
            </div>
            <div className="flex items-center gap-1 rounded-lg bg-secondary p-0.5">
              {filters.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    filter === f.key
                      ? "bg-card text-foreground ring-1 ring-border"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-2">
          {/* header row (desktop) */}
          <div className="hidden grid-cols-[1.6fr_1fr_1.2fr_0.8fr_auto] gap-4 px-3 pb-1 text-xs font-medium text-muted-foreground md:grid">
            <span>Employee</span>
            <span>Department</span>
            <span>Top risk driver</span>
            <span>Risk score</span>
            <span className="sr-only">Actions</span>
          </div>

          {rows.map((e) => {
            const open = openId === e.id
            return (
              <div key={e.id} className="rounded-lg bg-muted/40 ring-1 ring-border/60">
                <div className="grid grid-cols-1 items-center gap-3 p-3 md:grid-cols-[1.6fr_1fr_1.2fr_0.8fr_auto] md:gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                      {e.name.split(" ").map((n) => n[0]).join("")}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{e.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{e.role}</p>
                    </div>
                  </div>

                  <div className="flex flex-col text-sm">
                    <span>{e.department}</span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="size-3" />
                      {e.location}
                    </span>
                  </div>

                  <p className="truncate text-sm text-muted-foreground">{e.topDriver}</p>

                  <div className="flex items-center gap-2.5">
                    <div className="flex flex-col gap-1">
                      <span className="font-mono text-sm font-semibold tabular-nums">{e.riskScore}</span>
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${e.riskScore}%`, background: riskBarColor(e.riskLevel) }}
                        />
                      </div>
                    </div>
                    <RiskBadge level={e.riskLevel} />
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setOpenId(open ? null : e.id)}
                  >
                    <Sparkles className="size-3.5 text-primary" />
                    AI plan
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
                        <p className="text-xs font-medium text-primary">AI retention recommendation</p>
                        <p className="mt-1 text-sm text-pretty">{e.suggestion}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Manager: {e.manager} · Tenure: {e.tenure} · Confidence 87%
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button size="sm" className="gap-1.5">
                            <Check className="size-3.5" />
                            Approve & assign to {e.manager.split(" ")[0]}
                          </Button>
                          <Button variant="outline" size="sm">
                            Draft outreach
                          </Button>
                          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
                            <X className="size-3.5" />
                            Dismiss
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {rows.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No employees match your filters.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
