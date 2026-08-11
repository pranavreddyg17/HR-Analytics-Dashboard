import type { RequestActor } from "@/lib/server/request-user"

export type AssistantSafetyDecision = {
  allowed: boolean
  category?: "protected_instructions" | "credential_exfiltration" | "bulk_personal_data" | "automated_employment_decision" | "protected_attribute_decision"
  response?: string
}

const hiddenInstructionPatterns = [
  /\b(?:system|developer|hidden|internal)\s+(?:message|prompt|instruction|policy|rules?)\b/i,
  /\b(?:ignore|disregard|override|bypass|forget)\b.{0,80}\b(?:previous|prior|system|developer|instruction|guardrail|policy)\b/i,
  /\b(?:reveal|print|repeat|dump|show|quote|return)\b.{0,80}\b(?:prompt|instructions?|system message|developer message|chain of thought)\b/i,
  /\b(?:jailbreak|prompt injection|developer mode|do anything now)\b/i,
]

const credentialPatterns = [
  /\b(?:show|reveal|print|dump|return|find|retrieve|list|copy|encode|decode|exfiltrate)\b.{0,80}\b(?:api keys?|passwords?|secrets?|access tokens?|refresh tokens?|credentials?|environment variables?|key vault)\b/i,
  /\b(?:AZURE_OPENAI_API_KEY|AZURE_AI_SEARCH_API_KEY|GOOGLE_CLIENT_SECRET|DATABASE_URL|AUTH_SECRET)\b/i,
]

const bulkPersonalDataPatterns = [
  /\b(?:export|dump|list|show|return|give me)\b.{0,60}\b(?:all|every|entire)\b.{0,50}\b(?:employee|worker|personnel)\b.{0,80}\b(?:email|phone|salary|compensation|address|personal|private|medical)\b/i,
  /\b(?:database|table|sql)\s+(?:dump|export)\b/i,
]

const automatedDecisionPatterns = [
  /\b(?:automatically|without (?:human|manager|hr) review|no human review)\b.{0,100}\b(?:fire|terminate|lay off|reject|demote|cut pay|reduce salary|discipline|promote)\b/i,
  /\b(?:fire|terminate|lay off|reject|demote|cut (?:their )?pay|reduce (?:their )?salary)\b.{0,100}\b(?:based (?:only )?on|because of)\b.{0,60}\b(?:risk|model|score|prediction|attrition)\b/i,
]

const protectedAttributeDecisionPatterns = [
  /\b(?:fire|terminate|lay off|reject|demote|exclude|promote|hire|rank)\b.{0,100}\b(?:because (?:they|the employee|the candidate) (?:is|are)|based (?:only )?on|according to)\b.{0,80}\b(?:age|race|ethnicity|religion|sex|gender|pregnan|disab|marital|national origin|sexual orientation)\b/i,
  /\b(?:women|men|pregnant|disabled|older|younger|religious|married)\s+(?:employees?|workers?|candidates?)\b.{0,80}\b(?:fire|terminate|lay off|reject|exclude|rank|avoid hiring)\b/i,
]

export function normalizeAssistantInput(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/\r\n?/g, "\n")
    .trim()
}

export function evaluateAssistantInput(value: string, actor?: RequestActor): AssistantSafetyDecision {
  const query = normalizeAssistantInput(value)
  if (hiddenInstructionPatterns.some((pattern) => pattern.test(query))) {
    return {
      allowed: false,
      category: "protected_instructions",
      response: "I can’t provide hidden prompts, internal instructions, or methods for bypassing the assistant’s controls. I can explain the assistant’s published capabilities, evidence sources, and approval safeguards.",
    }
  }
  if (credentialPatterns.some((pattern) => pattern.test(query))) {
    return {
      allowed: false,
      category: "credential_exfiltration",
      response: "I can’t retrieve credentials, secrets, tokens, environment variables, or Key Vault values. An administrator can review configured service health without exposing secret material.",
    }
  }
  if (bulkPersonalDataPatterns.some((pattern) => pattern.test(query))) {
    return {
      allowed: false,
      category: "bulk_personal_data",
      response: actor?.role === "admin" || actor?.role === "hr"
        ? "I can provide an aggregate workforce analysis or a minimum-field, purpose-limited employee review. Bulk personal-data exports must use the governed reporting and access process."
        : "I can provide aggregate workforce analysis within your access scope, but I can’t disclose bulk employee personal data.",
    }
  }
  if (automatedDecisionPatterns.some((pattern) => pattern.test(query))) {
    return {
      allowed: false,
      category: "automated_employment_decision",
      response: "I can help review evidence and prepare a human-owned follow-up, but I can’t make or execute an employment decision from a model score or protected signal.",
    }
  }
  if (protectedAttributeDecisionPatterns.some((pattern) => pattern.test(query))) {
    return {
      allowed: false,
      category: "protected_attribute_decision",
      response: "I can’t rank, target, or recommend an employment action using a protected or sensitive personal attribute. I can help review job-related, purpose-limited evidence through the governed HR process.",
    }
  }
  return { allowed: true }
}

export function sanitizeRetrievedGuidance(value: string): string {
  const normalized = normalizeAssistantInput(value).slice(0, 8_000)
  return normalized
    .split("\n")
    .filter((line) => !hiddenInstructionPatterns.some((pattern) => pattern.test(line)))
    .join("\n")
}

export function isSafeModelSynthesis(value: string): boolean {
  if (!value.trim() || value.length > 8_000) return false
  if (hiddenInstructionPatterns.some((pattern) => pattern.test(value))) return false
  if (/\b(?:sk-|AIza|eyJ[a-zA-Z0-9_-]{10,}\.)[a-zA-Z0-9_.-]{12,}\b/.test(value)) return false
  if (/\b(?:AZURE_OPENAI_API_KEY|AZURE_AI_SEARCH_API_KEY|GOOGLE_CLIENT_SECRET|DATABASE_URL|AUTH_SECRET)\s*[:=]/i.test(value)) return false
  return true
}
