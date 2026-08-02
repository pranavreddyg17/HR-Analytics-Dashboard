import { cn } from "@/lib/utils"
import type { RiskLevel } from "@/lib/types"

const styles: Record<RiskLevel, string> = {
  high: "border-destructive/30 text-destructive",
  medium: "border-warning/30 text-warning",
  low: "border-success/30 text-success",
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
        "inline-flex items-center rounded-sm border px-2 py-0.5 text-status font-semibold",
        styles[level],
        className,
      )}
    >
      {labels[level]}
    </span>
  )
}
