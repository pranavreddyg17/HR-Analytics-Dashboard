import type { RequestActor } from "@/lib/server/request-user"
import { ensureHrDatabase } from "@/lib/server/hr-repository"

type ConversationMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  tools?: Array<{ tool: string; status: string; input?: Record<string, unknown>; resultContext?: { employeeIds?: string[]; recordScope?: string }; iteration?: number }>
  context?: Array<{ source: string; section: string }>
  dataMode?: string
  provider?: string
  workflow?: {
    prompt: string
    type: "calendar_invite" | "learning_assignment" | "hiring_requisition" | "retention_review"
    title: string
    evidence: string
    requiresConfirmation: true
  }
  createdAt: string
}

type ConversationSummary = {
  id: string
  title: string
  messageCount: number
  updatedAt: string
}

type ConversationRow = {
  id: string
  title: string
  message_count: number
  updated_at: string
}

type MessageRow = {
  id: string
  role: string
  content: string
  tools_json: string | null
  context_json: string | null
  data_mode: string | null
  provider: string | null
  workflow_json: string | null
  created_at: string
}

function parseArray<T>(value: string | null): T[] | undefined {
  if (!value) return undefined
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed as T[] : undefined
  } catch {
    return undefined
  }
}

function titleFromMessage(message: string): string {
  const cleaned = message.replace(/\s+/g, " ").trim()
  if (cleaned.length <= 64) return cleaned
  return `${cleaned.slice(0, 61).trimEnd()}…`
}

async function ownedConversation(actor: RequestActor, conversationId: string): Promise<{ id: string; title: string }> {
  const database = await ensureHrDatabase()
  if (!database) throw new Error("Conversation storage is unavailable.")
  const row = await database.prepare("SELECT id, title FROM ai_conversations WHERE id = ? AND user_email = ?")
    .bind(conversationId, actor.email)
    .first<{ id: string; title: string }>()
  if (!row) throw new Error("CONVERSATION_NOT_FOUND")
  return row
}

export async function createConversation(actor: RequestActor, firstMessage: string): Promise<ConversationSummary> {
  const database = await ensureHrDatabase()
  if (!database) throw new Error("Conversation storage is unavailable.")
  const id = `CONV-${crypto.randomUUID()}`
  const title = titleFromMessage(firstMessage)
  await database.prepare("INSERT INTO ai_conversations(id, user_email, title, created_at, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)")
    .bind(id, actor.email, title)
    .run()
  return { id, title, messageCount: 0, updatedAt: new Date().toISOString() }
}

export async function listConversations(actor: RequestActor): Promise<ConversationSummary[]> {
  const database = await ensureHrDatabase()
  if (!database) return []
  const result = await database.prepare(`
    SELECT c.id, c.title, c.updated_at,
      (SELECT COUNT(*) FROM ai_conversation_messages m WHERE m.conversation_id = c.id) AS message_count
    FROM ai_conversations c
    WHERE c.user_email = ?
    ORDER BY c.updated_at DESC, c.id DESC
    LIMIT 20
  `).bind(actor.email).all<ConversationRow>()
  return (result.results ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    messageCount: Number(row.message_count),
    updatedAt: row.updated_at,
  }))
}

export async function getConversation(actor: RequestActor, conversationId: string): Promise<{ conversation: ConversationSummary; messages: ConversationMessage[] }> {
  const conversation = await ownedConversation(actor, conversationId)
  const database = await ensureHrDatabase()
  if (!database) throw new Error("Conversation storage is unavailable.")
  const result = await database.prepare(`
    SELECT id, role, content, tools_json, context_json, data_mode, provider, workflow_json, created_at
    FROM ai_conversation_messages
    WHERE conversation_id = ?
    ORDER BY position ASC
  `).bind(conversationId).all<MessageRow>()
  const messages = (result.results ?? []).flatMap((row): ConversationMessage[] => {
    if (row.role !== "user" && row.role !== "assistant") return []
    return [{
      id: row.id,
      role: row.role,
      content: row.content,
      tools: parseArray<{ tool: string; status: string; input?: Record<string, unknown>; resultContext?: { employeeIds?: string[]; recordScope?: string }; iteration?: number }>(row.tools_json),
      context: parseArray<{ source: string; section: string }>(row.context_json),
      dataMode: row.data_mode ?? undefined,
      provider: row.provider ?? undefined,
      workflow: row.workflow_json ? parseWorkflow(row.workflow_json) : undefined,
      createdAt: row.created_at,
    }]
  })
  return {
    conversation: { id: conversation.id, title: conversation.title, messageCount: messages.length, updatedAt: messages.at(-1)?.createdAt ?? "" },
    messages,
  }
}

export async function deleteConversation(actor: RequestActor, conversationId: string): Promise<{ id: string; title: string }> {
  const conversation = await ownedConversation(actor, conversationId)
  const database = await ensureHrDatabase()
  if (!database) throw new Error("Conversation storage is unavailable.")
  await database.batch([
    database.prepare("DELETE FROM ai_conversation_messages WHERE conversation_id = ?").bind(conversationId),
    database.prepare("DELETE FROM ai_conversations WHERE id = ? AND user_email = ?").bind(conversationId, actor.email),
  ])
  return conversation
}

export async function getConversationContext(actor: RequestActor, conversationId: string): Promise<Array<{ role: "user" | "assistant"; content: string; tools?: ConversationMessage["tools"] }>> {
  const { messages } = await getConversation(actor, conversationId)
  let characters = 0
  const selected: Array<{ role: "user" | "assistant"; content: string; tools?: ConversationMessage["tools"] }> = []
  for (const message of messages.slice().reverse()) {
    if (selected.length >= 12 || characters + message.content.length > 12_000) break
    selected.unshift({ role: message.role, content: message.content, tools: message.tools })
    characters += message.content.length
  }
  return selected
}

function parseWorkflow(value: string): ConversationMessage["workflow"] | undefined {
  try {
    const parsed = JSON.parse(value) as ConversationMessage["workflow"]
    return parsed && typeof parsed.prompt === "string" && typeof parsed.title === "string" ? parsed : undefined
  } catch {
    return undefined
  }
}

export async function appendConversationMessage(
  actor: RequestActor,
  conversationId: string,
  message: Omit<ConversationMessage, "id" | "createdAt">,
): Promise<void> {
  await ownedConversation(actor, conversationId)
  const database = await ensureHrDatabase()
  if (!database) throw new Error("Conversation storage is unavailable.")
  const position = await database.prepare("SELECT COALESCE(MAX(position), 0) + 1 AS position FROM ai_conversation_messages WHERE conversation_id = ?")
    .bind(conversationId)
    .first<{ position: number }>()
  await database.batch([
    database.prepare("INSERT INTO ai_conversation_messages(id, conversation_id, position, role, content, tools_json, context_json, data_mode, provider, workflow_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)")
      .bind(
        `MSG-${crypto.randomUUID()}`,
        conversationId,
        Number(position?.position ?? 1),
        message.role,
        message.content,
        message.tools ? JSON.stringify(message.tools) : null,
        message.context ? JSON.stringify(message.context) : null,
        message.dataMode ?? null,
        message.provider ?? null,
        message.workflow ? JSON.stringify(message.workflow) : null,
      ),
    database.prepare("UPDATE ai_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_email = ?")
      .bind(conversationId, actor.email),
  ])
}
