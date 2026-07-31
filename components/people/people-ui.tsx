import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
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
  const className = status === "Active"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300"
    : status === "On leave"
      ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300"
      : status === "Preboarding"
        ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300"
        : "border-border bg-muted text-muted-foreground"
  return <Badge variant="outline" className={cn("h-6 px-2.5", className)}>{status}</Badge>
}

export function SourcePill({ source }: { source: string }) {
  return source === "demo"
    ? <span className="text-[10px] font-medium text-amber-700 dark:text-amber-300">Sample record</span>
    : <span className="text-[10px] font-medium text-muted-foreground">Operational record</span>
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "Not recorded"
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export function plural(value: number, word: string): string {
  return `${value.toLocaleString()} ${word}${value === 1 ? "" : "s"}`
}
