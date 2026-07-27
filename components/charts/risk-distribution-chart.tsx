"use client"

import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Cell } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { RiskBucket, RiskLevel } from "@/lib/types"

const config = {
  count: { label: "Records", color: "var(--chart-1)" },
} satisfies ChartConfig

const levelColor: Record<RiskLevel, string> = {
  low: "var(--chart-1)",
  medium: "var(--chart-2)",
  high: "var(--chart-3)",
}

export function RiskDistributionChart({ data }: { data: RiskBucket[] }) {
  return (
    <ChartContainer config={config} className="aspect-auto h-56 w-full">
      <BarChart data={data} margin={{ left: -8, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="band" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} tickMargin={8} />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
          content={
            <ChartTooltipContent
              formatter={(value, _n, item) => (
                <div className="flex w-full items-center justify-between gap-3">
                  <span className="text-muted-foreground">Predicted risk {item.payload.band}</span>
                  <span className="font-mono font-medium tabular-nums">
                    {Number(value).toLocaleString()}
                  </span>
                </div>
              )}
            />
          }
        />
        <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={48}>
          {data.map((d) => (
            <Cell key={d.band} fill={levelColor[d.level]} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}
