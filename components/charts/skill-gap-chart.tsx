"use client"

import { PolarAngleAxis, PolarGrid, Radar, RadarChart } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart"

export type SkillGap = { skill: string; current: number; target: number }

const config = {
  current: { label: "Current level", color: "var(--chart-1)" },
  target: { label: "Target level", color: "var(--chart-2)" },
} satisfies ChartConfig

export function SkillGapChart({ data }: { data: SkillGap[] }) {
  return (
    <ChartContainer config={config} className="mx-auto aspect-square h-72">
      <RadarChart data={data} outerRadius="72%">
        <ChartTooltip content={<ChartTooltipContent />} />
        <PolarAngleAxis dataKey="skill" className="text-[11px]" />
        <PolarGrid stroke="var(--border)" />
        <Radar dataKey="target" fill="var(--color-target)" fillOpacity={0.12} stroke="var(--color-target)" strokeWidth={2} />
        <Radar dataKey="current" fill="var(--color-current)" fillOpacity={0.35} stroke="var(--color-current)" strokeWidth={2} />
        <ChartLegend content={<ChartLegendContent />} />
      </RadarChart>
    </ChartContainer>
  )
}
