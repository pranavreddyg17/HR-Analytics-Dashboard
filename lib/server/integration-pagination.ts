import { IntegrationApiError } from "@/lib/server/integration-api"

export type IntegrationPage = { limit: number; offset: number }

export function integrationPage(params: URLSearchParams, maximum = 100): IntegrationPage {
  const rawLimit = params.get("limit") ?? "50"
  const rawOffset = params.get("offset") ?? "0"
  const limit = Number(rawLimit)
  const offset = Number(rawOffset)
  if (!Number.isInteger(limit) || limit < 1 || limit > maximum) {
    throw new IntegrationApiError(`limit must be an integer between 1 and ${maximum}.`, 422)
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw new IntegrationApiError("offset must be a non-negative integer.", 422)
  }
  return { limit, offset }
}

export function pageItems<T>(items: T[], page: IntegrationPage) {
  return {
    total: items.length,
    limit: page.limit,
    offset: page.offset,
    hasMore: page.offset + page.limit < items.length,
    items: items.slice(page.offset, page.offset + page.limit),
  }
}
