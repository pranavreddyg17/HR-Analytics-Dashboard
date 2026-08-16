import assert from "node:assert/strict"
import test from "node:test"

import { getPaginationWindow, pageForItem } from "../lib/pagination"

test("returns the correct first page window", () => {
  assert.deepEqual(getPaginationWindow(31, 1, 10), {
    page: 1,
    pageCount: 4,
    pageSize: 10,
    startIndex: 0,
    endIndex: 10,
    firstItem: 1,
    lastItem: 10,
  })
})

test("clamps pages after filters reduce the result set", () => {
  assert.deepEqual(getPaginationWindow(14, 9, 10), {
    page: 2,
    pageCount: 2,
    pageSize: 10,
    startIndex: 10,
    endIndex: 14,
    firstItem: 11,
    lastItem: 14,
  })
})

test("handles empty and invalid input without invalid ranges", () => {
  assert.deepEqual(getPaginationWindow(0, 0, 0), {
    page: 1,
    pageCount: 1,
    pageSize: 10,
    startIndex: 0,
    endIndex: 0,
    firstItem: 0,
    lastItem: 0,
  })
})

test("opens a directly linked record on the page that contains it", () => {
  assert.equal(pageForItem(0, 10), 1)
  assert.equal(pageForItem(10, 10), 2)
  assert.equal(pageForItem(49, 25), 2)
})
