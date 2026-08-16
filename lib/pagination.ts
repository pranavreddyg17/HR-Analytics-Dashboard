export type PaginationWindow = {
  page: number
  pageCount: number
  pageSize: number
  startIndex: number
  endIndex: number
  firstItem: number
  lastItem: number
}

function positiveInteger(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}

export function getPaginationWindow(totalItems: number, requestedPage: number, requestedPageSize: number): PaginationWindow {
  const total = Math.max(0, Math.floor(Number.isFinite(totalItems) ? totalItems : 0))
  const pageSize = positiveInteger(requestedPageSize, 10)
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(positiveInteger(requestedPage, 1), pageCount)
  const startIndex = total === 0 ? 0 : (page - 1) * pageSize
  const endIndex = Math.min(startIndex + pageSize, total)

  return {
    page,
    pageCount,
    pageSize,
    startIndex,
    endIndex,
    firstItem: total === 0 ? 0 : startIndex + 1,
    lastItem: endIndex,
  }
}

export function pageForItem(itemIndex: number, pageSize: number): number {
  if (!Number.isFinite(itemIndex) || itemIndex < 0) return 1
  return Math.floor(itemIndex / positiveInteger(pageSize, 10)) + 1
}
