import type { InboxItem } from "@/lib/people-types"

export type InboxOperations = {
  generatedAt: string
  summary: {
    assignedToMe: number
    decisions: number
    managerQueue: number
    employeeQueue: number
    overdue: number
    allOpen: number
    completed: number
    byDomain: Record<InboxItem["type"], number>
  }
  items: InboxItem[]
}
