import { createHash } from "node:crypto"
import { readFile, readdir } from "node:fs/promises"
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
    if (content) result.push({ source, section, content, sequence: result.length })
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

// The index contains stable domain and operating guidance only. The private
// system prompt remains in the application and is never copied into retrieval.
const files = (await readdir(join(process.cwd(), "knowledge")))
  .filter((file) => file.endsWith(".md") && file !== "laidbackhr-system-prompt.md")
  .sort()
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

const indexedDocuments = documents.map((document, index) => ({
  "@search.action": "mergeOrUpload",
  id: createHash("sha256").update(`${document.source}:${document.section}:${document.sequence}`).digest("hex"),
  source: document.source,
  section: document.section,
  content: document.content,
  contentVector: vectors.get(index),
}))

await request(endpoint(`/indexes/${encodeURIComponent(indexName)}/docs/index`), {
  method: "POST",
  headers: { "content-type": "application/json", "api-key": searchKey },
  body: JSON.stringify({ value: indexedDocuments }),
})

const existing = await request(endpoint(`/indexes/${encodeURIComponent(indexName)}/docs/search`), {
  method: "POST",
  headers: { "content-type": "application/json", "api-key": searchKey },
  body: JSON.stringify({ search: "*", select: "id", top: 1000 }),
})
const currentIds = new Set(indexedDocuments.map((document) => document.id))
const stale = (existing.value || []).filter((document) => !currentIds.has(document.id))
if (stale.length) {
  await request(endpoint(`/indexes/${encodeURIComponent(indexName)}/docs/index`), {
    method: "POST",
    headers: { "content-type": "application/json", "api-key": searchKey },
    body: JSON.stringify({ value: stale.map((document) => ({ "@search.action": "delete", id: document.id })) }),
  })
}

const qualityProbes = [
  { query: "how is attrition rate calculated", expected: "analytics-metric-contracts.md" },
  { query: "assign learning to a role cohort", expected: "capability-and-learning.md" },
  { query: "new joiner verification readiness", expected: "lifecycle-operating-playbooks.md" },
  { query: "employee data privacy access", expected: "data-governance-and-quality.md" },
  { query: "which tool should answer a current page queue", expected: "assistant-retrieval-guide.md" },
  { query: "how should HR triage reimbursement and employee service cases", expected: "employee-services-and-portal.md" },
  { query: "how should workforce impact and replacement scenarios be interpreted", expected: "insights-decision-support.md" },
  { query: "what can the workflow agent prepare and what requires confirmation", expected: "ai-copilot-operating-model.md" },
  { query: "how are prompt injection and excessive agency tested", expected: "ai-safety-and-evaluation.md" },
  { query: "how can an external system call workforce analytics APIs", expected: "integration-api.md" },
  { query: "who is leaving and which assets must be returned during offboarding", expected: "exit-and-asset-operations.md" },
]

async function runQualityProbes() {
  const failures = []
  for (const probe of qualityProbes) {
    const response = await request(endpoint(`/indexes/${encodeURIComponent(indexName)}/docs/search`), {
      method: "POST",
      headers: { "content-type": "application/json", "api-key": searchKey },
      body: JSON.stringify({ search: probe.query, queryType: "simple", searchMode: "any", select: "source,section", top: 5 }),
    })
    const sources = (response.value || []).map((document) => document.source)
    if (!sources.includes(probe.expected)) failures.push({ ...probe, sources })
  }
  if (failures.length) throw new Error(`Azure AI Search quality probes failed: ${JSON.stringify(failures)}`)
}

let probeError
for (let attempt = 1; attempt <= 3; attempt += 1) {
  try {
    await runQualityProbes()
    probeError = undefined
    break
  } catch (error) {
    probeError = error
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1500))
  }
}
if (probeError) throw probeError

console.log(JSON.stringify({ index: indexName, documents: documents.length, removed: stale.length, dimensions, qualityProbes: qualityProbes.length }))
