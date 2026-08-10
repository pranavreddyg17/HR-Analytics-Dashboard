import { DefaultAzureCredential } from "@azure/identity"
import { BlobServiceClient } from "@azure/storage-blob"
import { z } from "zod"

import { ensureHrDatabase, type Database } from "@/lib/server/hr-repository"
import { PeopleError } from "@/lib/server/people"
import type { RequestActor } from "@/lib/server/request-user"
import { runtimeEnv } from "@/lib/server/runtime-env"

const metadataSchema = z.object({
  documentType: z.enum(["resume", "receipt", "profile_photo", "supporting_document"]),
  visibility: z.enum(["employee", "manager", "hr"]).default("employee"),
})

const allowedTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
])
const maximumBytes = 10 * 1024 * 1024

async function database(): Promise<Database> {
  const value = await ensureHrDatabase()
  if (!value) throw new PeopleError("Document storage is unavailable.", 503)
  return value
}

async function employeeForActor(db: Database, actor: RequestActor): Promise<string> {
  const row = await db.prepare("SELECT employee_id FROM employee_directory_view WHERE LOWER(work_email)=LOWER(?) AND archived_at IS NULL")
    .bind(actor.email).first<{ employee_id: string }>()
  if (!row) throw new PeopleError("Your account is not linked to an employee record.", 409)
  return row.employee_id
}

function containerClient() {
  const accountUrl = runtimeEnv.EMPLOYEE_DOCUMENTS_ACCOUNT_URL
  if (!accountUrl) throw new PeopleError("Azure document storage is not configured.", 503)
  const service = new BlobServiceClient(accountUrl, new DefaultAzureCredential())
  return service.getContainerClient(runtimeEnv.EMPLOYEE_DOCUMENTS_CONTAINER ?? "employee-documents")
}

function safeName(value: string): string {
  const normalized = value.normalize("NFKC").replace(/[^a-zA-Z0-9._ -]/g, "_").replace(/\s+/g, " ").trim()
  return (normalized || "document").slice(0, 180)
}

export async function uploadEmployeeDocument(file: File, metadata: unknown, actor: RequestActor, requestedEmployeeId?: string | null) {
  const input = metadataSchema.parse(metadata)
  if (!["admin", "hr"].includes(actor.role) && input.visibility !== "employee") throw new PeopleError("Employee uploads must remain visible to the employee and HR.", 403)
  if (!file.size || file.size > maximumBytes) throw new PeopleError("Documents must be between 1 byte and 10 MB.", 422)
  if (!allowedTypes.has(file.type)) throw new PeopleError("Upload a PDF, DOCX, JPEG, or PNG file.", 422)
  const db = await database()
  const employeeId = requestedEmployeeId?.trim()
    ? await (async () => {
        if (!["admin", "hr"].includes(actor.role)) throw new PeopleError("Only HR can upload a document to another employee profile.", 403)
        const target = await db.prepare("SELECT employee_id FROM employee_directory_view WHERE employee_id=? AND archived_at IS NULL")
          .bind(requestedEmployeeId.trim()).first<{ employee_id: string }>()
        if (!target) throw new PeopleError("Employee profile not found.", 404)
        return target.employee_id
      })()
    : await employeeForActor(db, actor)
  const id = `DOC-${crypto.randomUUID().slice(0, 12).toUpperCase()}`
  const fileName = safeName(file.name)
  const blobName = `${employeeId}/${new Date().getUTCFullYear()}/${id}-${fileName}`
  const blob = containerClient().getBlockBlobClient(blobName)
  await blob.uploadData(Buffer.from(await file.arrayBuffer()), {
    blobHTTPHeaders: { blobContentType: file.type },
    metadata: { employeeId, documentId: id, documentType: input.documentType },
  })
  try {
    await db.prepare(`
      INSERT INTO employee_documents(id, employee_id, document_type, file_name, blob_name, content_type, size_bytes, visibility, uploaded_by_email)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(id, employeeId, input.documentType, fileName, blobName, file.type, file.size, input.visibility, actor.email).run()
  } catch (error) {
    await blob.deleteIfExists().catch(() => undefined)
    throw error
  }
  return { id, fileName, documentType: input.documentType, sizeBytes: file.size, createdAt: new Date().toISOString() }
}

export async function downloadEmployeeDocument(id: string, actor: RequestActor) {
  const db = await database()
  const row = await db.prepare(`
    SELECT d.id, d.employee_id, d.file_name, d.blob_name, d.content_type, d.size_bytes, d.visibility,
      e.manager_id
    FROM employee_documents d JOIN employee_directory_view e ON e.employee_id=d.employee_id
    WHERE d.id=?
  `).bind(id).first<{ id: string; employee_id: string; file_name: string; blob_name: string; content_type: string; size_bytes: number; visibility: string; manager_id: string | null }>()
  if (!row) throw new PeopleError("Document not found.", 404)
  const actorEmployee = await db.prepare("SELECT employee_id FROM employee_directory_view WHERE LOWER(work_email)=LOWER(?) AND archived_at IS NULL")
    .bind(actor.email).first<{ employee_id: string }>()
  const allowed = ["admin", "hr"].includes(actor.role)
    || actorEmployee?.employee_id === row.employee_id && row.visibility === "employee"
    || actor.role === "manager" && actorEmployee?.employee_id === row.manager_id && row.visibility === "manager"
  if (!allowed) throw new PeopleError("You do not have access to this document.", 403)
  if (Number(row.size_bytes) > maximumBytes) throw new PeopleError("Document is too large to download through this service.", 422)
  const response = await containerClient().getBlobClient(row.blob_name).download()
  const bytes = await response.blobBody?.then((value) => value.arrayBuffer())
  if (!bytes) throw new PeopleError("The document could not be read from Azure storage.", 503)
  return { bytes, fileName: row.file_name, contentType: row.content_type }
}

export async function deleteEmployeeDocument(id: string, actor: RequestActor): Promise<void> {
  const db = await database()
  const privileged = ["admin", "hr"].includes(actor.role)
  const employeeId = privileged ? null : await employeeForActor(db, actor)
  const row = await db.prepare(`
    SELECT d.id, d.employee_id, d.blob_name,
      EXISTS(SELECT 1 FROM expense_claims e WHERE e.receipt_document_id=d.id) AS in_use
    FROM employee_documents d WHERE d.id=?
  `).bind(id).first<{ id: string; employee_id: string; blob_name: string; in_use: boolean }>()
  if (!row) return
  if (!privileged && row.employee_id !== employeeId) throw new PeopleError("You do not have access to this document.", 403)
  if (row.in_use) throw new PeopleError("This document is attached to an employee record and cannot be removed.", 409)
  await containerClient().getBlobClient(row.blob_name).deleteIfExists()
  await db.prepare("DELETE FROM employee_documents WHERE id=?").bind(id).run()
}
