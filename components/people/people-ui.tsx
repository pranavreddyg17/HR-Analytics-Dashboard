import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { StatusIndicator } from "@/components/status-indicator"
import { cn } from "@/lib/utils"

export function PersonAvatar({
  employeeId,
  initials,
  size = "default",
  className,
}: {
  employeeId: string
  initials: string
  size?: "default" | "sm" | "lg" | "xl"
  className?: string
}) {
  const avatarSize = size === "xl" ? "size-20" : size === "lg" ? "size-11" : size === "sm" ? "size-8" : "size-10"
  return (
    <Avatar data-employee-id={employeeId} className={cn(avatarSize, "shadow-none", className)}>
      <AvatarFallback className={cn("bg-secondary font-semibold text-secondary-foreground", size === "xl" ? "text-xl" : "text-xs")}>
        {initials || employeeId.slice(-2)}
      </AvatarFallback>
    </Avatar>
  )
}

export function StatusPill({ status }: { status: string }) {
  return <StatusIndicator value={status} />
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "Not recorded"
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export function plural(value: number, word: string): string {
  return `${value.toLocaleString()} ${word}${value === 1 ? "" : "s"}`
}
