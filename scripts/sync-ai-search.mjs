import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { basename, join } from "node:path"

const required = (name) => {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required.`)
  return value
}

const searchEndpoint = required("AZURE_AI_SEARCH_ENDPOINT")
const searchKey = required("AZURE_AI_SEARCH_API_KEY")
const embeddingEndpoint = required("AZURE_OPENAI_EMBEDDING_ENDPOINT")
const embeddingKey = required("AZURE_OPENAI_EMBEDDING_API_KEY")
const embeddingModel = process.env.AZURE_OPENAI_EMBEDDING_MODEL || "text-embedding-3-small"
const indexName = process.env.AZURE_AI_SEARCH_INDEX || "laidbackhr-knowledge-v1"
const apiVersion = "2024-07-01"

function chunks(markdown, source) {
  const result = []
  let section = "Overview"
  let body = []
  const flush = () => {
    const content = body.join("\n").trim()
    if (content) result.push({ source, section, content })
    body = []
  }
  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^#{1,3}\s+(.+)$/)
    if (heading) { flush(); section = heading[1].trim() } else { body.push(line) }
  }
  flush()
  return result
}

function endpoint(path) {
  const url = new URL(path, searchEndpoint)
  url.searchParams.set("api-version", apiVersion)
  return url
}

function embeddingUrl() {
  const url = new URL(embeddingEndpoint)
  const path = url.pathname.replace(/\/+$/, "")
  if (!/\/embeddings$/.test(path)) {
    url.pathname = /\/openai\/v1$/.test(path)
      ? `${path}/embeddings`
      : `${path}/openai/v1/embeddings`.replace(/\/{2,}/g, "/")
  }
  return url
}

async function request(url, options) {
  const response = await fetch(url, options)
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`)
  return response.status === 204 ? null : response.json()
}

const files = ["laidbackhr-system-prompt.md", "hr-workspace-context.md"]
const documents = (await Promise.all(files.map(async (file) => chunks(await readFile(join(process.cwd(), "knowledge", file), "utf8"), basename(file))))).flat()
const embeddingResponse = await request(embeddingUrl(), {
  method: "POST",
  headers: { "content-type": "application/json", "api-key": embeddingKey },
  body: JSON.stringify({ model: embeddingModel, input: documents.map((document) => `${document.section}\n${document.content}`) }),
})
const vectors = new Map((embeddingResponse.data || []).map((item) => [item.index, item.embedding]))
const dimensions = vectors.get(0)?.length
if (!dimensions) throw new Error("Embedding service returned no vectors.")

await request(endpoint(`/indexes/${encodeURIComponent(indexName)}`), {
  method: "PUT",
  headers: { "content-type": "application/json", "api-key": searchKey },
  body: JSON.stringify({
    name: indexName,
    fields: [
      { name: "id", type: "Edm.String", key: true, searchable: false, filterable: true },
      { name: "source", type: "Edm.String", searchable: true, filterable: true },
      { name: "section", type: "Edm.String", searchable: true, filterable: true },
      { name: "content", type: "Edm.String", searchable: true },
      { name: "contentVector", type: "Collection(Edm.Single)", searchable: true, dimensions, vectorSearchProfile: "laidbackhr-vector-profile" },
    ],
    vectorSearch: {
      algorithms: [{ name: "laidbackhr-hnsw", kind: "hnsw", hnswParameters: { metric: "cosine", m: 4, efConstruction: 400, efSearch: 500 } }],
      profiles: [{ name: "laidbackhr-vector-profile", algorithm: "laidbackhr-hnsw" }],
    },
  }),
})

await request(endpoint(`/indexes/${encodeURIComponent(indexName)}/docs/index`), {
  method: "POST",
  headers: { "content-type": "application/json", "api-key": searchKey },
  body: JSON.stringify({ value: documents.map((document, index) => ({
    "@search.action": "mergeOrUpload",
    id: createHash("sha256").update(`${document.source}:${document.section}`).digest("hex"),
    ...document,
    contentVector: vectors.get(index),
  })) }),
})

console.log(JSON.stringify({ index: indexName, documents: documents.length, dimensions }))
