import { ZodError } from "zod"

import { downloadEmployeeDocument, uploadEmployeeDocument } from "@/lib/server/employee-documents"
import { PeopleError } from "@/lib/server/people"
import { requireRequestActor } from "@/lib/server/request-user"

function errorResponse(error: unknown) {
  const status = error instanceof PeopleError ? error.status : error instanceof ZodError ? 422 : error instanceof Error && error.message === "AUTH_REQUIRED" ? 401 : 500
  const detail = error instanceof ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Document request failed."
  return Response.json({ error: detail }, { status })
}

export async function POST(request: Request) {
  try {
    const actor = await requireRequestActor(request)
    const form = await request.formData()
    const file = form.get("file")
    if (!(file instanceof File)) return Response.json({ error: "Select a document to upload." }, { status: 422 })
    const result = await uploadEmployeeDocument(file, {
      documentType: form.get("documentType"),
      visibility: form.get("visibility") || "employee",
    }, actor)
    return Response.json(result, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function GET(request: Request) {
  try {
    const actor = await requireRequestActor(request)
    const id = new URL(request.url).searchParams.get("id")
    if (!id || id.length > 100) return Response.json({ error: "A valid document ID is required." }, { status: 422 })
    const document = await downloadEmployeeDocument(id, actor)
    return new Response(document.bytes, {
      headers: {
        "content-type": document.contentType,
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(document.fileName)}`,
        "cache-control": "private, no-store",
      },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
