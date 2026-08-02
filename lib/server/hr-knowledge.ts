import systemPromptMarkdown from "@/knowledge/laidbackhr-system-prompt.md?raw"
import workspaceContextMarkdown from "@/knowledge/hr-workspace-context.md?raw"

export type KnowledgeMatch = {
  source: string
  section: string
  content: string
}

type KnowledgeChunk = KnowledgeMatch & {
  terms: Set<string>
}

const stopWords = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how", "in",
  "is", "it", "of", "on", "or", "that", "the", "this", "to", "what", "when",
  "where", "which", "who", "with",
])

function terms(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((term) => term.length > 2 && !stopWords.has(term)),
  )
}

function chunksFromMarkdown(source: string, markdown: string): KnowledgeChunk[] {
  const chunks: KnowledgeChunk[] = []
  let section = "Overview"
  let buffer: string[] = []

  function flush() {
    const content = buffer.join("\n").trim()
    if (content) chunks.push({ source, section, content, terms: terms(`${section} ${content}`) })
    buffer = []
  }

  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.+)$/)
    if (heading) {
      flush()
      section = heading[1].trim()
    } else if (!line.startsWith("# ")) {
      buffer.push(line)
    }
  }
  flush()
  return chunks
}

const knowledgeChunks = chunksFromMarkdown("HR workspace context", workspaceContextMarkdown)

function retrieveHrContext(query: string, limit = 3): KnowledgeMatch[] {
  const queryTerms = terms(query)
  const ranked = knowledgeChunks
    .map((chunk) => {
      let score = 0
      for (const term of queryTerms) {
        if (chunk.terms.has(term)) score += chunk.section.toLowerCase().includes(term) ? 3 : 1
      }
      return { chunk, score }
    })
    .sort((a, b) => b.score - a.score)

  const matches = ranked.filter((item) => item.score > 0).slice(0, limit)
  const selected = matches.length ? matches : ranked.filter((item) => item.chunk.section === "Data source modes" || item.chunk.section === "Workflow actions").slice(0, limit)
  return selected.map(({ chunk }) => ({ source: chunk.source, section: chunk.section, content: chunk.content }))
}

export function buildHrSystemPrompt(query: string): { prompt: string; context: KnowledgeMatch[] } {
  const context = retrieveHrContext(query)
  const retrieved = context.map((item) => `### ${item.section}\n${item.content}`).join("\n\n")
  return {
    prompt: `${systemPromptMarkdown.trim()}\n\n# Retrieved workspace guidance\n${retrieved}`,
    context,
  }
}
