import { readFile, readdir } from "node:fs/promises"
import { join } from "node:path"

const files = (await readdir(join(process.cwd(), "knowledge")))
  .filter((file) => file.endsWith(".md") && file !== "laidbackhr-system-prompt.md")
  .sort()
const stopWords = new Set(["a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how", "in", "is", "it", "of", "on", "or", "that", "the", "this", "to", "what", "when", "where", "which", "who", "with"])
const terms = (value) => new Set(value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((term) => term.length > 2 && !stopWords.has(term)))

function chunks(markdown, source) {
  const result = []
  let section = "Overview"
  let body = []
  const flush = () => {
    const content = body.join("\n").trim()
    if (content) result.push({ source, section, terms: terms(`${section} ${content}`) })
    body = []
  }
  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^#{2,3}\s+(.+)$/)
    if (heading) { flush(); section = heading[1].trim() } else if (!line.startsWith("# ")) { body.push(line) }
  }
  flush()
  return result
}

const documents = (await Promise.all(files.map(async (file) => chunks(await readFile(join(process.cwd(), "knowledge", file), "utf8"), file)))).flat()
const probes = [
  { query: "how is attrition rate calculated", expected: "analytics-metric-contracts.md" },
  { query: "assign learning to a role cohort", expected: "capability-and-learning.md" },
  { query: "new joiner verification readiness", expected: "lifecycle-operating-playbooks.md" },
  { query: "employee data privacy access", expected: "data-governance-and-quality.md" },
  { query: "which tool should answer a current page queue", expected: "assistant-retrieval-guide.md" },
  { query: "reimbursement employee service resolution", expected: "employee-services-and-portal.md" },
  { query: "replacement scenario workforce impact", expected: "insights-decision-support.md" },
  { query: "workflow confirmation copilot planner", expected: "ai-copilot-operating-model.md" },
  { query: "prompt injection service credential excessive agency", expected: "ai-safety-and-evaluation.md" },
  { query: "external workforce API bearer scopes OpenAPI", expected: "integration-api.md" },
]
const failures = []
for (const probe of probes) {
  const queryTerms = terms(probe.query)
  const ranked = documents.map((document) => {
    let score = 0
    for (const term of queryTerms) {
      if (document.terms.has(term)) score += document.section.toLowerCase().includes(term) ? 3 : 1
    }
    return { source: document.source, section: document.section, score }
  }).sort((left, right) => right.score - left.score).slice(0, 3)
  if (!ranked.some((document) => document.source === probe.expected)) failures.push({ ...probe, ranked })
}
if (failures.length) {
  console.error(JSON.stringify({ failures }, null, 2))
  process.exit(1)
}
console.log(JSON.stringify({ documents: documents.length, probes: probes.length, status: "passed" }))
