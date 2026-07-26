"use client"

import { Area, AreaChart, CartesianGrid, Line, XAxis, YAxis, ReferenceLine } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { attritionTrend } from "@/lib/data"

const config = {
  actual: { label: "Actual attrition", color: "var(--chart-1)" },
  predicted: { label: "ML prediction", color: "var(--chart-2)" },
  benchmark: { label: "Industry benchmark", color: "var(--muted-foreground)" },
} satisfies ChartConfig

export function AttritionTrendChart() {
  return (
    <ChartContainer config={config} className="aspect-auto h-72 w-full">
      <AreaChart data={attritionTrend} margin={{ left: -12, right: 8, top: 8 }}>
        <defs>
          <linearGradient id="fillActual" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-actual)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--color-actual)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          domain={[8, 18]}
          tickFormatter={(v) => `${v}%`}
        />
        <ChartTooltip
          content={<ChartTooltipContent formatter={(value, name) => (
            <div className="flex w-full items-center justify-between gap-3">
              <span className="text-muted-foreground">{config[name as keyof typeof config]?.label}</span>
              <span className="font-mono font-medium tabular-nums">{value}%</span>
            </div>
          )} />}
        />
        <ReferenceLine x="Sep" stroke="var(--border)" strokeDasharray="4 4" label={{ value: "Forecast", position: "insideTopRight", fill: "var(--muted-foreground)", fontSize: 11 }} />
        <Area
          dataKey="actual"
          type="monotone"
          stroke="var(--color-actual)"
          strokeWidth={2}
          fill="url(#fillActual)"
          connectNulls={false}
        />
        <Line
          dataKey="predicted"
          type="monotone"
          stroke="var(--color-predicted)"
          strokeWidth={2}
          strokeDasharray="5 4"
          dot={false}
        />
        <Line
          dataKey="benchmark"
          type="monotone"
          stroke="var(--color-benchmark)"
          strokeWidth={1.5}
          dot={false}
        />
        <ChartLegend content={<ChartLegendContent />} />
      </AreaChart>
    </ChartContainer>
  )
}
