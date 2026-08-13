import { cn } from "@/lib/utils"

function statusTone(value: string): string {
  const normalized = value.toLowerCase()
  if (/rejected|declined|overdue|failed|terminated|resigned|cancelled/.test(normalized)) return "bg-destructive"
  if (/pending|incomplete|open|submitted|review|progress|scheduled|notice|on leave|on bench/.test(normalized)) return "bg-warning"
  if (/active|approved|completed|resolved|paid|closed|available|returned/.test(normalized)) return "bg-primary"
  return "bg-muted-foreground"
}

function statusLabel(value: unknown): string {
  const normalized = String(value || "Not recorded").replaceAll("_", " ").trim()
  return normalized ? `${normalized[0]?.toUpperCase() ?? ""}${normalized.slice(1)}` : "Not recorded"
}

export function StatusIndicator({ value, className }: { value: unknown; className?: string }) {
  const label = statusLabel(value)
  return <span className={cn("inline-flex w-fit items-center gap-2 text-meta font-semibold text-foreground", className)}><span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", statusTone(label))} />{label}</span>
}
