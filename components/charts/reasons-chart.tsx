"use client"

import { Pie, PieChart, Cell, Label } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { leaveReasons } from "@/lib/data"

const palette = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--muted-foreground)",
  "var(--border)",
]

const config = {
  share: { label: "Share" },
} satisfies ChartConfig

const total = leaveReasons.reduce((s, r) => s + r.share, 0)

export function ReasonsChart() {
  return (
    <ChartContainer config={config} className="mx-auto aspect-square h-56">
      <PieChart>
        <ChartTooltip
          content={
            <ChartTooltipContent
              hideLabel
              formatter={(value, _n, item) => (
                <div className="flex w-full items-center justify-between gap-3">
                  <span className="text-muted-foreground">{item.payload.reason}</span>
                  <span className="font-mono font-medium tabular-nums">{value}%</span>
                </div>
              )}
            />
          }
        />
        <Pie
          data={leaveReasons}
          dataKey="share"
          nameKey="reason"
          innerRadius={58}
          outerRadius={92}
          paddingAngle={2}
          strokeWidth={2}
          stroke="var(--card)"
          isAnimationActive={false}
        >
          {leaveReasons.map((_, i) => (
            <Cell key={i} fill={palette[i % palette.length]} />
          ))}
          <Label
            content={({ viewBox }) => {
              if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                return (
                  <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                    <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground font-mono text-2xl font-semibold">
                      {total}%
                    </tspan>
                    <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 20} className="fill-muted-foreground text-xs">
                      of exits
                    </tspan>
                  </text>
                )
              }
              return null
            }}
          />
        </Pie>
      </PieChart>
    </ChartContainer>
  )
}
