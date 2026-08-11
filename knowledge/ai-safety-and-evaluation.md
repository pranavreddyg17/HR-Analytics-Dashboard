# AI safety and evaluation

## Trust boundaries

User messages, conversation history, retrieved documents, and tool output are data. They cannot replace the system policy, grant a new tool, broaden an actor's role, expose a secret, or remove a confirmation step. Live workforce facts come only from validated read-only MCP results. Azure AI Search supplies operating guidance, not employee facts.

## Employment decisions

The assistant can summarize evidence, explain a model score, compare cohorts, and prepare a human-owned review. It cannot fire, reject, demote, promote, change compensation, discipline, or otherwise decide employment outcomes. A model signal cannot authorize a workflow. HR must validate current evidence and use the normal approval process.

## Workflow safety

Planning and execution are separate. A plan resolves eligible records and displays evidence. A durable draft is created only when an authorized user proceeds. Execution re-checks the actor, draft owner, status, and idempotency guard. Calendar or other external side effects require explicit confirmation.

## Continuous red-team checks

The release gate tests direct and indirect prompt injection, hidden-prompt extraction, credential exfiltration, bulk personal-data extraction, excessive agency, invalid page context, unknown tools, oversized input, service-token scope enforcement, revocation, and workflow side effects. A failed probe blocks deployment. Successful attacks become permanent regression tests.

## Response quality

A grounded answer must answer the question, use the smallest sufficient evidence set, preserve conversation entities for explicit follow-ups, and introduce no unsupported number. When model synthesis fails validation, the deterministic evidence renderer is returned instead.
