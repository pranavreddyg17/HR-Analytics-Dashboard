const workspaceDateTime = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Los_Angeles",
})

function timestamp(value: string | Date): Date {
  if (value instanceof Date) return value
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? `${value.replace(" ", "T")}Z`
    : value
  return new Date(normalized)
}

export function formatWorkspaceDateTime(value: string | Date): string {
  const parsed = timestamp(value)
  return Number.isFinite(parsed.getTime()) ? workspaceDateTime.format(parsed) : String(value)
}
