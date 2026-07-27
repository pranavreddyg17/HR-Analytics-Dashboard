"use client"

import { Bar, BarChart, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { Feature } from "@/lib/types"

const config = {
  importance: { label: "Importance", color: "var(--chart-1)" },
} satisfies ChartConfig

export function FeatureImportanceChart({ data }: { data: Feature[] }) {
  const sorted = [...data].sort((a, b) => b.importance - a.importance).slice(0, 10)
  return (
    <ChartContainer config={config} className="aspect-auto h-80 w-full">
      <BarChart data={sorted} layout="vertical" margin={{ left: 8, right: 40 }}>
        <XAxis type="number" domain={[0, "auto"]} hide />
        <YAxis
          type="category"
          dataKey="feature"
          tickLine={false}
          axisLine={false}
          width={175}
          tickMargin={4}
          className="text-[11px]"
        />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
          content={
            <ChartTooltipContent
              formatter={(value, _n, item) => (
                <div className="flex w-full items-center justify-between gap-3">
                  <span className="text-muted-foreground">{item.payload.feature}</span>
                  <span className="font-mono font-medium tabular-nums">
                    {(Number(value) * 100).toFixed(1)}%
                  </span>
                </div>
              )}
            />
          }
        />
        <Bar
          dataKey="importance"
          fill="var(--color-importance)"
          radius={[0, 6, 6, 0]}
          barSize={20}
        />
      </BarChart>
    </ChartContainer>
  )
}
