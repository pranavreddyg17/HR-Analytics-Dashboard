"use client"

import { Pie, PieChart, Cell, Label } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { LeaveReason } from "@/lib/types"

const palette = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--muted-foreground)",
]

const config = {
  share: { label: "Share" },
} satisfies ChartConfig

export function ReasonsChart({ data }: { data: LeaveReason[] }) {
  const total = data.reduce((sum, item) => sum + item.share, 0)
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
                  <span className="font-mono font-medium tabular-nums">{Number(value).toFixed(1)}%</span>
                </div>
              )}
            />
          }
        />
        <Pie
          data={data}
          dataKey="share"
          nameKey="reason"
          innerRadius={58}
          outerRadius={92}
          paddingAngle={2}
          strokeWidth={2}
          stroke="var(--card)"
          isAnimationActive={false}
        >
          {data.map((_, index) => (
            <Cell key={index} fill={palette[index % palette.length]} />
          ))}
          <Label
            content={({ viewBox }) => {
              if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                return (
                  <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                    <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground font-mono text-2xl font-semibold">
                      {total.toFixed(0)}%
                    </tspan>
                    <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 20} className="fill-muted-foreground text-xs">
                      positive signal
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
