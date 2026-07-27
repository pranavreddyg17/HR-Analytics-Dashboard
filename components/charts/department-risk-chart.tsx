"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Cell } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { DeptRisk } from "@/lib/types"

const config = {
  riskScore: { label: "Mean risk", color: "var(--chart-1)" },
} satisfies ChartConfig

function barColor(score: number) {
  if (score >= 20) return "var(--chart-3)"
  if (score >= 14) return "var(--chart-2)"
  return "var(--chart-1)"
}

export function DepartmentRiskChart({ data }: { data: DeptRisk[] }) {
  const sorted = [...data].sort((a, b) => b.riskScore - a.riskScore)
  return (
    <ChartContainer config={config} className="aspect-auto h-72 w-full">
      <BarChart data={sorted} layout="vertical" margin={{ left: 8, right: 24 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis type="number" domain={[0, "auto"]} hide />
        <YAxis
          type="category"
          dataKey="department"
          tickLine={false}
          axisLine={false}
          width={145}
          tickMargin={4}
        />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
          content={
            <ChartTooltipContent
              formatter={(value, _name, item) => (
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{item.payload.department}</span>
                  <span className="text-muted-foreground">
                    Mean risk {Number(value).toFixed(1)}% · {item.payload.atRisk} above threshold · {item.payload.attrition}% observed attrition
                  </span>
                </div>
              )}
            />
          }
        />
        <Bar dataKey="riskScore" radius={[0, 6, 6, 0]} barSize={26}>
          {sorted.map((d) => (
            <Cell key={d.department} fill={barColor(d.riskScore)} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}
