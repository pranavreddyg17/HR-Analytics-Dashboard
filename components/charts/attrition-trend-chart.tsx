"use client"

import { Area, AreaChart, CartesianGrid, Line, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { TrendPoint } from "@/lib/types"

const config = {
  actual: { label: "Observed attrition", color: "var(--chart-1)" },
  predicted: { label: "Mean predicted risk", color: "var(--chart-2)" },
  benchmark: { label: "Overall observed rate", color: "var(--muted-foreground)" },
} satisfies ChartConfig

export function AttritionTrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <ChartContainer config={config} className="aspect-auto h-72 w-full">
      <AreaChart data={data} margin={{ left: 0, right: 16, top: 8 }}>
        <defs>
          <linearGradient id="fillActual" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-actual)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--color-actual)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis tickLine={false} axisLine={false} tickMargin={8} unit="%" domain={[0, "auto"]} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name, item) => (
                <div className="flex w-full items-center justify-between gap-3">
                  <span className="text-muted-foreground">
                    {config[name as keyof typeof config]?.label ?? name}
                  </span>
                  <span className="font-mono font-medium tabular-nums">
                    {Number(value).toFixed(1)}%
                    {item.payload.count ? ` · n=${item.payload.count}` : ""}
                  </span>
                </div>
              )}
            />
          }
        />
        <Area
          dataKey="actual"
          type="monotone"
          stroke="var(--color-actual)"
          strokeWidth={2}
          fill="url(#fillActual)"
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
