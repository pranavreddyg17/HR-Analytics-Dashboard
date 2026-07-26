import { ArrowDownRight, ArrowUpRight } from "lucide-react"

import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { Kpi } from "@/lib/data"

export function KpiCard({ kpi }: { kpi: Kpi }) {
  const isUp = kpi.delta >= 0
  // "Good" when the movement direction matches what we want for this metric.
  const isGood = isUp === kpi.positiveIsGood
  const Arrow = isUp ? ArrowUpRight : ArrowDownRight

  return (
    <Card className="gap-2 p-4">
      <p className="text-xs font-medium text-muted-foreground">{kpi.label}</p>
      <p className="font-mono text-2xl font-semibold tracking-tight tabular-nums">{kpi.value}</p>
      <div className="flex items-center gap-1.5 text-xs">
        <span
          className={cn(
            "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium tabular-nums",
            isGood ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
          )}
        >
          <Arrow className="size-3" />
          {Math.abs(kpi.delta)}%
        </span>
        <span className="truncate text-muted-foreground">{kpi.deltaLabel}</span>
      </div>
    </Card>
  )
}
