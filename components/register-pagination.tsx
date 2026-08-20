"use client"

import { useState } from "react"
import * as m from "motion/react-m"

import { Button } from "@/components/ui/button"
import { getPaginationWindow, pageForItem } from "@/lib/pagination"

type RegisterPaginationProps<T> = {
  rows: readonly T[]
  itemLabel: string
  resetKey: string
  children: (pageRows: readonly T[]) => React.ReactNode
  initialItemIndex?: number
  initialPageSize?: number
  pageSizeOptions?: readonly number[]
}

export function RegisterPagination<T>({
  rows,
  itemLabel,
  resetKey,
  children,
  initialItemIndex = -1,
  initialPageSize = 10,
  pageSizeOptions = [10, 25, 50],
}: RegisterPaginationProps<T>) {
  const [navigation, setNavigation] = useState(() => ({
    page: pageForItem(initialItemIndex, initialPageSize),
    pageSize: initialPageSize,
    resetKey,
  }))
  const requestedPage = navigation.resetKey === resetKey
    ? navigation.page
    : pageForItem(initialItemIndex, navigation.pageSize)
  const window = getPaginationWindow(rows.length, requestedPage, navigation.pageSize)
  const pageRows = rows.slice(window.startIndex, window.endIndex)
  const label = rows.length === 1 && itemLabel.endsWith("s") ? itemLabel.slice(0, -1) : itemLabel

  function changePage(page: number) {
    setNavigation((current) => ({ ...current, page, resetKey }))
  }

  function changePageSize(pageSize: number) {
    setNavigation({
      page: pageForItem(initialItemIndex, pageSize),
      pageSize,
      resetKey,
    })
  }

  return <>
    <m.div
      key={`${resetKey}:${window.page}:${window.pageSize}`}
      className="register-pagination__content"
      initial={{ opacity: 0, y: 3 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.14 }}
    >
      {children(pageRows)}
    </m.div>
    {rows.length > 0 && <div className="flex flex-col gap-2 border-t border-border bg-muted/20 px-4 py-2.5 text-meta text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <p aria-live="polite" className="tabular-nums">
        {window.firstItem}–{window.lastItem} of {rows.length.toLocaleString()} {label}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2">
          <span>Rows per page</span>
          <select
            aria-label={`Rows per page for ${itemLabel}`}
            value={window.pageSize}
            onChange={(event) => changePageSize(Number(event.target.value))}
            className="h-8 rounded-md border border-border bg-background px-2 text-control text-foreground outline-none focus:ring-2 focus:ring-ring/20"
          >
            {pageSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
        <Button type="button" size="xs" variant="outline" disabled={window.page === 1} onClick={() => changePage(window.page - 1)}>Previous</Button>
        <span className="min-w-20 text-center tabular-nums">Page {window.page} of {window.pageCount}</span>
        <Button type="button" size="xs" variant="outline" disabled={window.page === window.pageCount} onClick={() => changePage(window.page + 1)}>Next</Button>
      </div>
    </div>}
  </>
}
