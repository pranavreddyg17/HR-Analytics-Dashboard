"use client"

import type { CSSProperties, ReactNode } from "react"
import { useReducedMotion } from "motion/react"
import * as m from "motion/react-m"

import { cn } from "@/lib/utils"

export type WorkspaceMetric = {
  label: string
  value: ReactNode
  detail?: ReactNode
}

export function MotionMetricStrip({
  metrics,
  className,
}: {
  metrics: WorkspaceMetric[]
  className?: string
}) {
  const reduceMotion = useReducedMotion()

  return (
    <section
      aria-label="Summary"
      className={cn("workspace-metrics", className)}
      style={{ "--metric-count": metrics.length } as CSSProperties}
    >
      {metrics.map((metric, index) => (
        <m.div
          key={metric.label}
          className="workspace-metric"
          initial={reduceMotion ? false : { opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: reduceMotion ? 0 : Math.min(index, 5) * 0.025 }}
        >
          <p className="text-label text-muted-foreground">{metric.label}</p>
          <p className="mt-1 text-kpi font-semibold tabular-nums">{metric.value}</p>
          {metric.detail && <p className="mt-1 text-meta text-muted-foreground">{metric.detail}</p>}
        </m.div>
      ))}
    </section>
  )
}
