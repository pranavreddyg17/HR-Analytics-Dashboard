import { cn } from "@/lib/utils"
import type { RiskLevel } from "@/lib/data"

const styles: Record<RiskLevel, string> = {
  high: "bg-destructive/15 text-destructive ring-destructive/25",
  medium: "bg-warning/15 text-warning ring-warning/25",
  low: "bg-success/15 text-success ring-success/25",
}

const labels: Record<RiskLevel, string> = {
  high: "High risk",
  medium: "Medium",
  low: "Low",
}

export function RiskBadge({ level, className }: { level: RiskLevel; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        styles[level],
        className,
      )}
    >
      {labels[level]}
    </span>
  )
}
