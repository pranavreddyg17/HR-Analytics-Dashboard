import type { DomainStatus, HrDomain } from "@/lib/hr-types"

export type ImportMode = "merge" | "replace_imported"
export type ImportAction = "validate" | "apply"

export type ImportIssue = {
  severity: "error" | "warning"
  code: string
  message: string
  row?: number
  field?: string
}

export type ImportPreview = {
  domain: HrDomain
  filename: string
  mode: ImportMode
  totalRows: number
  validRows: number
  invalidRows: number
  inserts: number
  updates: number
  replacedRows: number
  canApply: boolean
  issues: ImportIssue[]
}

export type ImportJobStatus = "processing" | "completed" | "failed"

export type ImportJob = {
  id: string
  domain: HrDomain
  filename: string
  mode: ImportMode
  status: ImportJobStatus
  totalRows: number
  rowCount: number
  insertedRows: number
  updatedRows: number
  deletedRows: number
  errorCount: number
  errorSummary: string | null
  importedByEmail: string | null
  startedAt: string
  completedAt: string | null
}

export type DataStatusResponse = {
  generatedAt: string
  status: DomainStatus[]
  imports: ImportJob[]
  summary: {
    totalRecords: number
    completedImports: number
    failedImports: number
    lastCompletedAt: string | null
  }
}
