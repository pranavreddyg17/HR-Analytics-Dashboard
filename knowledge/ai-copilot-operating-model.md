# AI copilot operating model

## Evidence and planning

The copilot has three separate responsibilities. Azure Foundry plans the smallest sufficient read-only evidence request. MCP tools query actor-scoped PostgreSQL records. Azure AI Search retrieves stable definitions, playbooks, and guardrails. Foundry then synthesizes the final answer from those completed results.

Conversation history resolves explicit follow-ups but is not a factual source. Current employees, owners, dates, statuses, workflow state, compensation, model inputs, and counts always come from PostgreSQL through a domain service or MCP tool.

## Current-page behavior

The assistant receives a validated route and allow-listed filters. On Home and Work queue, decision questions use persisted actor-scoped workflow items. On People, named employee facts use directory records and service questions use linked workflows. On Onboarding, readiness questions combine pending-start records with recruiting handoffs. Leaves and Learning use their persisted domain records. Insights combines normalized workforce measures and durable exception work. Retention separates observed exits, current operational review evidence, and historical model evidence.

The page label is never used as an employee search phrase. A new self-contained request replaces the prior topic. Pronouns such as these employees or that department may use the most recent completed structured tool context.

## Supported workflow handoffs

The copilot can prepare four governed workflows: a calendar meeting for eligible operational employees, a role or profile learning campaign, a position requisition, and a department retention review. It resolves affected records, duplicates, scope, and required evidence before displaying a plan.

The user must review and confirm the plan before execution. Domain services enforce authorization, duplicate suppression, actor scope, and audit history. Calendar execution requires the user's connected Google Calendar grant. The copilot cannot approve leave, reject a reimbursement, change compensation, promote, terminate, or send an employee communication without a supported confirmation path.

## Answer quality

A useful answer leads with the conclusion, uses only relevant measures, identifies the affected record or cohort, and gives a practical next step. It does not repeat generic safety language when no risk-sensitive conclusion is present. When evidence is missing, it names the exact missing field or relationship rather than giving a generic refusal.

For model questions, distinguish the stored score, local model contributors, and the human review step. Contributors explain a score; they do not prove employee intent. For operational questions, include owner, due state, and next action when those fields are available.

## Failure and fallback

If Foundry generation is unavailable, deterministic rendering still returns database evidence. If Azure AI Search is unavailable, the assistant may answer current factual questions from MCP data but must not invent policy guidance. If a tool fails, the run audit records the failure and the answer must not imply that the missing domain was reviewed.
