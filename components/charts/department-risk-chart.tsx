"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Cell } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { departmentRisk } from "@/lib/data"

const config = {
  riskScore: { label: "Risk score", color: "var(--chart-1)" },
} satisfies ChartConfig

function barColor(score: number) {
  if (score >= 70) return "var(--chart-3)"
  if (score >= 50) return "var(--chart-2)"
  return "var(--chart-1)"
}

export function DepartmentRiskChart() {
  const data = [...departmentRisk].sort((a, b) => b.riskScore - a.riskScore)
  return (
    <ChartContainer config={config} className="aspect-auto h-72 w-full">
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis type="number" domain={[0, 100]} hide />
        <YAxis
          type="category"
          dataKey="department"
          tickLine={false}
          axisLine={false}
          width={110}
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
                    Risk {value} · {item.payload.atRisk} at-risk · {item.payload.attrition}% attrition
                  </span>
                </div>
              )}
            />
          }
        />
        <Bar dataKey="riskScore" radius={[0, 6, 6, 0]} barSize={22}>
          {data.map((d) => (
            <Cell key={d.department} fill={barColor(d.riskScore)} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}
