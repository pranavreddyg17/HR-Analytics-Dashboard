import { runtimeEnv } from "@/lib/server/runtime-env"

type SearchDocument = { source?: string; section?: string; content?: string; "@search.score"?: number }

function configured(name: string): string | null {
  const value = runtimeEnv[name]?.trim()
  if (!value || value.startsWith("@Microsoft.KeyVault(")) return null
  return value
}

function operationUrl(endpoint: string, operation: "embeddings" | "responses"): string {
  const url = new URL(endpoint)
  const path = url.pathname.replace(/\/+$/, "")
  if (new RegExp(`/${operation}$`).test(path)) return url.toString()
  url.pathname = /\/openai\/v1$/.test(path)
    ? `${path}/${operation}`
    : `${path}/openai/v1/${operation}`.replace(/\/{2,}/g, "/")
  return url.toString()
}

async function createAzureEmbedding(input: string): Promise<number[] | null> {
  const endpoint = configured("AZURE_OPENAI_EMBEDDING_ENDPOINT")
  const apiKey = configured("AZURE_OPENAI_EMBEDDING_API_KEY")
  if (!endpoint || !apiKey) return null
  const response = await fetch(operationUrl(endpoint, "embeddings"), {
    method: "POST",
    headers: { "content-type": "application/json", "api-key": apiKey },
    body: JSON.stringify({ model: runtimeEnv.AZURE_OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small", input }),
    signal: AbortSignal.timeout(12_000),
  })
  if (!response.ok) return null
  const body = await response.json() as { data?: Array<{ embedding?: number[] }> }
  return body.data?.[0]?.embedding ?? null
}

export async function searchAzureKnowledge(query: string, limit = 4): Promise<Array<{ source: string; section: string; content: string }>> {
  const endpoint = configured("AZURE_AI_SEARCH_ENDPOINT")
  const apiKey = configured("AZURE_AI_SEARCH_API_KEY")
  const index = configured("AZURE_AI_SEARCH_INDEX")
  if (!endpoint || !apiKey || !index) return []
  const vector = await createAzureEmbedding(query).catch(() => null)
  const url = new URL(`/indexes/${encodeURIComponent(index)}/docs/search`, endpoint)
  url.searchParams.set("api-version", "2024-07-01")
  const body: Record<string, unknown> = {
    search: query,
    queryType: "simple",
    searchMode: "all",
    select: "source,section,content",
    top: limit,
  }
  if (vector) body.vectorQueries = [{ kind: "vector", vector, fields: "contentVector", k: Math.max(limit, 6) }]
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "api-key": apiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8_000),
  })
  if (!response.ok) return []
  const result = await response.json() as { value?: SearchDocument[] }
  return (result.value ?? []).flatMap((item) => item.content
    ? [{ source: item.source || "LaidbackHR knowledge", section: item.section || "Workspace guidance", content: item.content }]
    : [])
}

export async function synthesizeWithAzureResponses(input: { system: string; user: string }): Promise<string | null> {
  const endpoint = configured("AZURE_OPENAI_ENDPOINT")
  const apiKey = configured("AZURE_OPENAI_API_KEY")
  const model = configured("AZURE_OPENAI_MODEL")
  if (!endpoint || !apiKey || !model) return null
  const response = await fetch(operationUrl(endpoint, "responses"), {
    method: "POST",
    headers: { "content-type": "application/json", "api-key": apiKey },
    body: JSON.stringify({
      model,
      temperature: 0,
      input: [
        { role: "system", content: [{ type: "input_text", text: input.system }] },
        { role: "user", content: [{ type: "input_text", text: input.user }] },
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) return null
  const body = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> }
  return (body.output_text ?? body.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text ?? "").trim() || null
}

export function azureAiConfiguration() {
  return {
    search: Boolean(configured("AZURE_AI_SEARCH_ENDPOINT") && configured("AZURE_AI_SEARCH_API_KEY") && configured("AZURE_AI_SEARCH_INDEX")),
    embeddings: Boolean(configured("AZURE_OPENAI_EMBEDDING_ENDPOINT") && configured("AZURE_OPENAI_EMBEDDING_API_KEY")),
    generation: Boolean(configured("AZURE_OPENAI_ENDPOINT") && configured("AZURE_OPENAI_API_KEY") && configured("AZURE_OPENAI_MODEL")),
  }
}
