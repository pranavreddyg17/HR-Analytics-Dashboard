import { ZodError } from "zod"

import { IntegrationApiError } from "@/lib/server/integration-api"

export function toIntegrationApiError(error: unknown): unknown {
  if (error instanceof IntegrationApiError) return error
  if (error instanceof ZodError) {
    return new IntegrationApiError(error.issues[0]?.message ?? "The request is invalid.", 422)
  }
  if (error instanceof Error && "status" in error) {
    const status = Number((error as Error & { status?: unknown }).status)
    if (Number.isInteger(status) && status >= 400 && status <= 599) {
      return new IntegrationApiError(error.message, status)
    }
  }
  return error
}
