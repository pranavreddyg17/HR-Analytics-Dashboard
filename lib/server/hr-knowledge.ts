import systemPromptMarkdown from "@/knowledge/laidbackhr-system-prompt.md?raw"
import analyticsMetricContractsMarkdown from "@/knowledge/analytics-metric-contracts.md?raw"
import assistantRetrievalGuideMarkdown from "@/knowledge/assistant-retrieval-guide.md?raw"
import capabilityLearningMarkdown from "@/knowledge/capability-and-learning.md?raw"
import dataGovernanceMarkdown from "@/knowledge/data-governance-and-quality.md?raw"
import workspaceContextMarkdown from "@/knowledge/hr-workspace-context.md?raw"
import lifecyclePlaybooksMarkdown from "@/knowledge/lifecycle-operating-playbooks.md?raw"
import workspaceOperationsMarkdown from "@/knowledge/workspace-operations.md?raw"
import employeeServicesMarkdown from "@/knowledge/employee-services-and-portal.md?raw"
import insightsDecisionSupportMarkdown from "@/knowledge/insights-decision-support.md?raw"
import aiCopilotOperatingModelMarkdown from "@/knowledge/ai-copilot-operating-model.md?raw"
import actorApprovalModelMarkdown from "@/knowledge/actor-and-approval-model.md?raw"
import { searchAzureKnowledge } from "@/lib/server/azure-ai"

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
    const heading = line.match(/^#{2,3}\s+(.+)$/)
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

const knowledgeChunks = [
  ...chunksFromMarkdown("HR workspace context", workspaceContextMarkdown),
  ...chunksFromMarkdown("Workspace operating context", workspaceOperationsMarkdown),
  ...chunksFromMarkdown("Analytics metric contracts", analyticsMetricContractsMarkdown),
  ...chunksFromMarkdown("Employee lifecycle playbooks", lifecyclePlaybooksMarkdown),
  ...chunksFromMarkdown("Capability and learning guide", capabilityLearningMarkdown),
  ...chunksFromMarkdown("Assistant retrieval guide", assistantRetrievalGuideMarkdown),
  ...chunksFromMarkdown("Data governance and quality guide", dataGovernanceMarkdown),
  ...chunksFromMarkdown("Employee services and portal guide", employeeServicesMarkdown),
  ...chunksFromMarkdown("Insights decision-support guide", insightsDecisionSupportMarkdown),
  ...chunksFromMarkdown("AI copilot operating model", aiCopilotOperatingModelMarkdown),
  ...chunksFromMarkdown("Actor and approval model", actorApprovalModelMarkdown),
]

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

export async function buildHrSystemPrompt(query: string): Promise<{ prompt: string; context: KnowledgeMatch[] }> {
  const remoteContext = await searchAzureKnowledge(query).catch(() => [])
  const context = remoteContext.length ? remoteContext : retrieveHrContext(query)
  const retrieved = context.map((item) => `### ${item.section}\n${item.content}`).join("\n\n")
  return {
    prompt: `${systemPromptMarkdown.trim()}\n\n# Retrieved workspace guidance\n${retrieved}`,
    context,
  }
}
