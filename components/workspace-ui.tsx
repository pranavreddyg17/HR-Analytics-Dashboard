import type { ReactNode } from "react"

import {
  MotionMetricStrip,
  type WorkspaceMetric,
} from "@/components/motion/motion-metric-strip"
import { cn } from "@/lib/utils"

export function WorkspacePage({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("workspace-page", className)}>{children}</div>
}

export function WorkspaceHeader({
  title,
  description,
  meta,
  actions,
}: {
  title: string
  description: string
  meta?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="workspace-header">
      <div className="min-w-0">
        <h1 className="text-page font-semibold">{title}</h1>
        <p className="workspace-header__description">{description}</p>
        {meta && <div className="workspace-header__meta">{meta}</div>}
      </div>
      {actions && <div className="workspace-header__actions">{actions}</div>}
    </header>
  )
}

export function MetricStrip({ metrics, className }: { metrics: WorkspaceMetric[]; className?: string }) {
  return <MotionMetricStrip metrics={metrics} className={className} />
}

export function WorkspaceSectionHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="workspace-section-header">
      <div className="min-w-0">
        <h2 className="text-card-title font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-meta text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
