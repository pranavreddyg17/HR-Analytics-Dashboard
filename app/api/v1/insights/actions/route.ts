import { NextResponse } from "next/server"
import { z, ZodError } from "zod"

import { createInsightWorkItem, InsightActionError } from "@/lib/server/insight-actions"
import { requireRequestActor } from "@/lib/server/request-user"

const filtersSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  department: z.string().trim().max(120).optional(),
  location: z.string().trim().max(120).optional(),
  period: z.enum(["month", "quarter", "year"]).optional(),
  recruitingCostPerHire: z.number().min(0).max(250_000).optional(),
  vacancyProductivityPercent: z.number().min(0).max(100).optional(),
  onboardingDays: z.number().min(0).max(730).optional(),
  onboardingProductivityPercent: z.number().min(0).max(100).optional(),
  courseFeePerLearner: z.number().min(0).max(100_000).optional(),
  courseHoursPerLearner: z.number().min(0.5).max(500).optional(),
}).strict()

const inputSchema = z.object({
  signalId: z.string().trim().min(3).max(180),
  filters: filtersSchema.default({}),
}).strict()

export async function POST(request: Request) {
  try {
    const actor = await requireRequestActor(request)
    const input = inputSchema.parse(await request.json())
    return NextResponse.json(await createInsightWorkItem(input.signalId, input.filters, actor), { status: 201 })
  } catch (error) {
    const message = error instanceof ZodError ? error.issues[0]?.message ?? "Invalid work item."
      : error instanceof Error ? error.message
        : "Unable to create insight work item."
    const status = error instanceof InsightActionError ? error.status
      : message === "AUTH_REQUIRED" ? 401
        : error instanceof ZodError ? 422
          : 500
    return NextResponse.json({ error: message }, { status })
  }
}
