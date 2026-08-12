# LaidBackHR.ai

LaidBackHR.ai is an Azure-native workforce operations and decision-support platform for HR teams, people managers, and employees. It combines a PostgreSQL system of record, employee self-service, operational approvals, workforce analytics, explainable attrition review, governed AI workflows, a Model Context Protocol (MCP) server, and a versioned integration API in one Next.js application.

The application is designed to answer two different needs without mixing them:

- **Operational HR:** create and manage employee profiles, onboarding, leave, reimbursements, employee cases, recruiting, learning, reviews, one-to-ones, documents, and approvals.
- **Decision support:** calculate workforce movement, coverage, capability, retention, and replacement scenarios from persisted records; retrieve governed HR guidance; and use AI to summarize evidence or prepare a human-approved workflow.

Production runs at [www.laidbackhr.cloud](https://www.laidbackhr.cloud). The employee experience uses [employee.laidbackhr.cloud](https://employee.laidbackhr.cloud) and the same application, identity layer, and database.

## Contents

- [Product capabilities](#product-capabilities)
- [Architecture](#architecture)
- [Azure services](#azure-services)
- [Data architecture](#data-architecture)
- [AI, RAG, agents, and MCP](#ai-rag-agents-and-mcp)
- [API reference](#api-reference)
- [Authentication and authorization](#authentication-and-authorization)
- [Local development](#local-development)
- [Configuration](#configuration)
- [Validation](#validation)
- [Deployment](#deployment)
- [Operations](#operations)
- [Repository structure](#repository-structure)
- [Responsible use](#responsible-use)

## Product capabilities

### HR workspace

| Route | Capability | Persisted result |
|---|---|---|
| `/` | Priority work and upcoming workforce events | Reads the actor-scoped workflow queue and operational records |
| `/people` | Current/former employee search, profiles, organization, manager, job, compensation, project, review, and one-to-one administration | Employee and related lifecycle tables; admin-only permanent deletion is restricted to former employees |
| `/inbox` | Decisions and assigned work across onboarding, recruiting, leave, learning, reimbursement, employee cases, and insight actions | Workflow status, owner, due date, resolution, and action history |
| `/onboarding` | Requisition-to-employee handoff and new-joiner verification | Requisitions, candidates, onboarding submissions, employees, and workflow records |
| `/leaves` | Leave register, approval decisions, absence schedule, and coverage | Leave and workflow records |
| `/courses` | Course catalog, capability mappings, cohort assignment, due dates, completion, and compliance | Courses, campaigns, assignments, and workflow records |
| `/exits` | Scheduled exits, accountable offboarding checklists, asset recovery, access removal, and completion | Employee exits, offboarding tasks, asset assignments, workflow records, and recorded exit outcomes |
| `/insights` | Workforce movement, continuity, talent supply, manager-cohort movement, capability completion, remaining effort, cost scenarios, and action queues | Calculated read models plus durable insight work items |
| `/attrition` | Historical model validation, cohort evidence, and explainable scenario testing | Model metadata, historical profiles, and retention reviews |
| `/risk-review` | Employee-linked review worklist with governed follow-up | Retention reviews and review status |
| `/assistant` | Context-aware workforce chat and workflow preparation | Conversations, messages, agent runs, tool steps, and approved workflow drafts |
| `/imports` | Validated imports, PDF/XLSX exports, Power BI feeds, and integration clients | Import jobs, imported domain records, API clients, and API audit |
| `/assets` | Equipment inventory, custody, assignment history, warranty, replacement, return, and condition | Assets and immutable assignment history |
| `/admin` | Application usage, API activity, import health, Azure telemetry, and cost | PostgreSQL operational metrics plus Azure management-plane data |
| `/access` | Workspace membership, roles, suspension, and removal | Application users and access audit |

Compatibility routes such as `/hiring`, `/learning`, `/time-off`, `/data`, `/employees`, and `/ai-agents` are retained only to preserve older bookmarks. New navigation uses the canonical routes above.

### Employee portal

The employee portal is not a separate database or duplicated frontend. The signed-in employee is linked to the same `app_users` and `employees` records used by HR.

- View and complete onboarding.
- Review profile, manager, job, project, and employment information.
- Request leave and track the decision.
- Submit reimbursement claims and private receipts.
- Open an HR case and see its resolution.
- Upload and retrieve authorized employee documents.
- View and complete assigned learning.
- Participate in performance reviews and one-to-one follow-up.
- Review assigned equipment and a confirmed offboarding schedule when applicable.
- Receive an explicit employment-ended state after termination or resignation instead of entering employee self-service.

Employee submissions create the operational record and its corresponding work item in one transaction. HR decisions update that same record, so both portals display the same state.
Terminating an employee immediately removes workspace and self-service access while preserving the profile under **People → Former**. An administrator may permanently delete a former profile and its dependent HR records; the application identity is reset to controlled onboarding so the same verified email can join again.

## Architecture

```mermaid
flowchart LR
    HR["HR and manager browser"]
    Employee["Employee browser"]
    Integrator["Customer integration"]
    DNS["laidbackhr.cloud domains"]
    Web["Azure App Service\nNext.js 16 / React 19"]
    Auth["Auth.js + Google / Microsoft Entra"]
    API["Route handlers and domain services"]
    PG["Azure Database for PostgreSQL\nSystem of record"]
    Blob["Azure Blob Storage\nPrivate employee documents"]
    Model["Embedded gradient-boosting\nprediction runtime"]
    MCP["Actor-scoped MCP server\n9 read-only tools"]
    Search["Azure AI Search\nHybrid and vector retrieval"]
    OpenAI["Azure OpenAI\nPlanning, synthesis, embeddings"]
    KV["Azure Key Vault\nRuntime configuration"]
    Monitor["Application Insights\nand Log Analytics"]
    ACR["Azure Container Registry"]
    GitHub["GitHub Actions\nValidation and deployment"]
    AzDO["Azure DevOps\nMirror validation and evidence"]
    TF["Terraform\nAzure resource state"]

    HR --> DNS --> Web
    Employee --> DNS
    Integrator -->|"Scoped bearer API"| Web
    Web --> Auth
    Web --> API
    API --> PG
    API --> Blob
    API --> Model
    API --> MCP
    MCP --> PG
    API --> Search
    Search --> OpenAI
    API --> OpenAI
    KV -. "Key Vault references" .-> Web
    Web --> Monitor
    GitHub --> ACR --> Web
    GitHub --> TF
    AzDO -. "Validates identical main SHA" .-> Web
```

### Request flow

1. Auth.js verifies the Google or Microsoft Entra identity and loads the current application role from PostgreSQL.
2. A route handler resolves the actor and enforces role or ownership boundaries.
3. A domain service validates the request, writes normalized records, and creates or advances a workflow where required.
4. Read models calculate metrics from current database facts. Analytics results are cached briefly in production but never stored as a second source of truth.
5. The UI invalidates the relevant view and reads the persisted result. The employee and HR portals therefore converge on the same record state.

### Design principles

- PostgreSQL is the only production system of record; there is no Cloudflare D1 or SQLite runtime path.
- Business rules live in server domain modules rather than React components.
- Derived values such as tenure, vacancy rate, time to hire, attrition rate, replacement rate, and cost scenarios are calculated from source facts.
- All material workflow transitions are attributable to an actor and are idempotent where retries are expected.
- AI can retrieve evidence, summarize, recommend review, or prepare a draft. It cannot bypass authorization or human approval.
- The historical attrition model supports validation and review prioritization, not automated employment decisions.

## Azure services

All application-owned runtime resources are provisioned in the existing `Laidback.ai` resource group. Azure OpenAI, embeddings, and Azure AI Search are approved shared Azure dependencies; this repository consumes their endpoints through the application Key Vault but does not create or rename those shared services.

| Azure service | Production responsibility |
|---|---|
| App Service | Runs the standalone Next.js container, health checks, managed identity, shared HR/employee portal, and VNet integration |
| App Service Plan | Cost-controlled Linux compute; `always_on`, HTTP/2, and a pooled PostgreSQL client support concurrent use |
| Azure Database for PostgreSQL Flexible Server | Normalized operational records, workflow state, conversation memory, agent audit, and integration audit |
| Blob Storage | Private employee documents and reimbursement receipts; public access and account-key use are disabled |
| Key Vault | Database URL, Auth.js secret, Google OAuth, Microsoft Entra, Azure AI Search, Azure OpenAI, and embedding credentials |
| Azure AI Search (shared) | Hybrid keyword/vector index for curated HR operating guidance; it does not contain live employee rows |
| Azure OpenAI (shared) | Schema-constrained planning, grounded response synthesis, and query/document embeddings |
| Container Registry | Immutable `laidbackhr-web:<git-sha>` production images and rollback history |
| Application Insights | Application request, dependency, exception, and trace telemetry |
| Log Analytics | Queryable telemetry used by the administrator operations monitor |
| Virtual Network | Dedicated App Service integration subnet and a reserved private-endpoint subnet |
| Managed identities | App-to-ACR, app-to-Blob, app-to-Key Vault, monitoring, cost, and federated deployment access without stored Azure passwords |
| Terraform state storage | Remote, Azure AD-authenticated Terraform state for serialized infrastructure changes |

The stable `f61hno` resource suffix was generated once by Terraform because several Azure resource names must be globally unique. It has no business or version meaning. Renaming those resources would recreate stateful infrastructure, so purpose and environment are expressed through tags and `terraform output resource_naming`.

Production resource names, DNS instructions, RBAC bootstrap commands, and network details are documented in [`infra/environments/production/README.md`](infra/environments/production/README.md).

## Data architecture

### System of record

SQL migrations in `db/postgres` are append-only and run idempotently during application initialization. The current migration sequence is:

| Migration | Responsibility |
|---|---|
| `0001_runtime.sql` | Core employees, recruiting, attrition, leave, training, promotions, imports, workflows, conversations, access, courses, and model registry |
| `0002_learning_assignment_dates.sql` | Learning assignment scheduling fields |
| `0003_employee_experience.sql` | Organizations, compensation, projects, documents, expenses, cases, reviews, one-to-ones, and agent audit |
| `0004_correlated_employee_experience.sql` | Correlated employee-experience seed and normalization support |
| `0005_operating_model.sql` | Normalized job profiles, derived views, onboarding, analytics settings, campaigns, and removal of derivable employee columns |
| `0006_onboarding_and_capability.sql` | Capability skills, job requirements, course coverage, and cohort targeting |
| `0007_employee_service_outcomes.sql` | Durable employee-case resolutions and ownership |
| `0008_ai_workflow_handoffs.sql` | Assistant-to-workflow handoff state |
| `0009_integration_api.sql` | Scoped integration clients and request audit |
| `0010_admin_provider_snapshots.sql` | Persistent Azure provider snapshots and retry state for the operations monitor |
| `0011_exit_and_assets.sql` | Employee exits, accountable offboarding tasks, IT assets, custody history, and lifecycle settings |

### Core relational domains

- **Organization and identity:** `organizations`, `app_users`, `employees`, `job_profiles`.
- **Employment context:** `employee_compensation`, `projects`, `employee_project_assignments`, `employee_documents`.
- **Talent acquisition and onboarding:** `hiring_records`, `hiring_candidates`, `hiring_activity`, `employee_onboarding_submissions`.
- **Time, services, and employee relations:** `leave_records`, `expense_claims`, `employee_cases`.
- **Capability and performance:** `learning_courses`, `learning_assignment_campaigns`, `course_assignments`, `capability_skills`, job/course skill mappings, `review_cycles`, `performance_reviews`, `one_on_one_meetings`, `promotion_records`.
- **Retention intelligence:** `attrition_events`, `attrition_model_profiles`, `model_versions`, and persisted retention review workflows.
- **Exit and asset operations:** `employee_exits`, `offboarding_tasks`, `assets`, `asset_assignments`, and `asset_lifecycle_settings`.
- **Workflow and audit:** `workflow_requests`, employee/hiring activity, `access_audit`, `data_imports`, `integration_api_audit`.
- **AI:** `ai_conversations`, `ai_conversation_messages`, `ai_workflow_drafts`, `agent_runs`, `agent_run_steps`.

Normalized views such as `employee_directory_view`, `hiring_requisitions_view`, `learning_assignments_view`, and `promotion_events_view` provide stable query contracts while keeping source columns normalized. For example, department and job title are resolved through `job_profiles`, manager display names through the employee relationship, tenure from `hire_date`, and time to hire from application/hire dates.

### Imports and reporting

The import service supports `employees`, `hiring`, `attrition`, `leave`, `training`, and `promotions` with two phases:

1. `validate` checks the domain contract and returns row-level issues without writing.
2. `apply` merges or replaces imported-domain rows and records the import result.

Power BI feeds and PDF/XLSX exports call the same analytics service as the UI. They do not maintain a separate reporting database, so filters and metric definitions remain consistent across the page, download, and API.

### Insights calculation contracts

- **Talent supply:** completed hires and exits use event dates in the reporting window; open requisitions and current team size are current snapshots. Manager-cohort exit rate is recorded exits divided by current active team plus those recorded exits. Voluntary share and share of department exits are shown as supporting context, never as a manager performance score.
- **Capability:** assignment completion is completed assignments divided by all assignments in scope. Employee coverage is unique assigned employees divided by active employees. Open and required work, overdue status, remaining recorded hours, and estimated delivery cost all come from current assignment, due-date, compensation, and scenario records.
- **Operational handoff:** filtering a cohort recalculates the shared analytics read model. Opening assignments passes the selected department and status into the Learning register, where authorized users can record completion or create governed cohort assignments.

## AI, RAG, agents, and MCP

### Grounded assistant flow

```mermaid
sequenceDiagram
    participant U as HR user
    participant C as Assistant UI
    participant O as Agent orchestrator
    participant S as Azure AI Search
    participant M as MCP tools
    participant D as PostgreSQL
    participant A as Azure OpenAI

    U->>C: Ask a page-aware question
    C->>O: Message, conversation history, actor, page context
    O->>S: Hybrid/vector retrieval for operating guidance
    S-->>O: Cited Markdown sections
    O->>O: Safety check and intent/tool plan
    O->>M: Invoke actor-scoped read-only tools
    M->>D: Query current workspace evidence
    D-->>M: Authorized records and aggregates
    M-->>O: Structured evidence and tool trace
    O->>A: System prompt + retrieved guidance + compact evidence
    A-->>O: Grounded concise synthesis
    O->>O: Evidence/numeric safety validation
    O-->>C: Answer, citations, provider, tool trace, optional workflow draft
```

The request includes the active page, route, selected record or queue item, visible filters, and conversation history. This prevents a prompt such as “what needs attention here?” from being treated as an unrelated global query.

The orchestrator performs a bounded plan-and-execute loop. The Azure planner may produce a schema-constrained tool plan, but application code validates every tool name and argument. A deterministic intent resolver and evidence renderer remain available when Azure generation is unavailable. Follow-up questions reuse the persisted conversation instead of starting with empty context.

### Retrieval-augmented generation

The `knowledge` directory contains 14 Markdown sources: one private system prompt embedded in the application and 13 operating guides synchronized to Azure AI Search. The indexed material covers metric contracts, lifecycle playbooks, capability planning, employee services, analytics interpretation, API behavior, approvals, and AI safety.

`pnpm ai:sync` performs the ingestion pipeline:

1. Read every operating guide except the private system prompt.
2. Split documents by Markdown section.
3. Generate `text-embedding-3-small` vectors through Azure OpenAI.
4. Create or update an HNSW cosine vector index in Azure AI Search.
5. merge current chunks, delete stale chunks, and run retrieval quality probes.

At query time the assistant combines keyword retrieval with vector retrieval and caches identical knowledge queries for five minutes. If Azure AI Search is unavailable, an embedded lexical retriever uses the same source documents. Live workforce facts are always retrieved from PostgreSQL through MCP and are never copied into the knowledge index.

### Agent catalog

`GET /api/v1/agents` returns the live catalog and recent actor-visible runs.

| Agent ID | Responsibility | Allowed MCP tools |
|---|---|---|
| `workforce-intelligence` | Headcount, movement, department comparison, data quality, and work queues | `workforce_overview`, `compare_departments`, `review_work_queue` |
| `retention-planner` | Attrition evidence, confirmed exits, model contributors, continuity, and bounded retention follow-up | `analyze_attrition_signals`, `review_exit_and_asset_operations`, `review_people_operations` |
| `recruiting-operations` | Onboarding readiness, recruiting handoffs, requisitions, candidates, and overdue work | `review_onboarding_readiness`, `review_people_operations`, `compare_departments`, `review_work_queue` |
| `learning-compliance` | Capability requirements, mandatory gaps, completion evidence, and cohort recommendations | `review_capability_plan`, `review_people_operations`, `find_employee_records` |
| `people-operations` | Leave, promotions, exits, assets, employee records, and cross-domain summaries | `review_people_operations`, `review_exit_and_asset_operations`, `find_employee_records`, `review_work_queue` |

Every run records the actor, objective, provider, status, timing, and ordered tool steps in PostgreSQL.

### MCP server

`/api/mcp` implements authenticated Streamable HTTP MCP. CORS is restricted to the application origin. The same server is connected in-process through the LangChain MCP adapter for low-latency assistant execution.

| MCP tool | Evidence returned |
|---|---|
| `review_work_queue` | Page- and actor-scoped decisions, overdue work, owners, due dates, and next actions |
| `workforce_overview` | Workforce KPIs, open work, executive observations, and data status |
| `compare_departments` | Headcount, hiring, exits, leave, learning, or promotion comparison |
| `analyze_attrition_signals` | Recorded exits, model review signals, linked employee evidence, and local model explanations |
| `review_people_operations` | Hiring, leave, training, promotion, and related operational exceptions |
| `find_employee_records` | Limited, role-appropriate employee directory results |
| `review_onboarding_readiness` | New-joiner verification, manager/start-date readiness, and recruiting handoff |
| `review_capability_plan` | Role requirements, learning evidence, course mappings, and hiring-demand context |
| `review_exit_and_asset_operations` | Confirmed exits, offboarding progress, access-removal work, asset custody, warranty, condition, and replacement exceptions |

All nine tools are read-only, idempotent, closed-world operations. Tool output is still filtered by the authenticated actor. Confirmed exit workflows and attrition-model review cohorts remain separate evidence types.

### Agentic workflows

The assistant can prepare four governed workflows:

- a Microsoft Teams meeting or Google Calendar event for selected operational employees;
- a learning assignment for a department, job title, job level, manager team, or job profile;
- a hiring requisition with business justification; or
- a retention review for a department evidence cohort.

An employee email draft can also be prepared for review in Gmail. Planning and execution are separate API calls. Drafts are stored in `ai_workflow_drafts`, visible to their creator, and must be confirmed. Learning, requisition, and retention execution writes the relevant operational record; Calendar execution requires a valid Google Calendar grant. The agent never sends an employment communication or changes employment status solely from model output.

### Attrition model

The deployed prediction runtime is **Compact Gradient Boosting 2.0.0**. It is embedded in the web container, so production does not pay for or wait on a second model service.

- Training reference: 1,470 historical records in `backend/data/attrition.csv`.
- Inputs: ten approved work-related fields; age and marital status are excluded.
- Selection: five-fold stratified out-of-fold comparison against regularized logistic regression plus repeated stability checks.
- Current benchmark: ROC-AUC 0.727, average precision 0.364, Brier score 0.122, with an F1-selected human-review threshold of 0.20.
- Explanation: reference-profile sensitivity reports model contributors, not causal reasons.
- Runtime artifacts: the Python joblib pipeline and model card are the retraining/test reference; `lib/server/runtime-data.json` is the web runtime export.

The public integration API exposes metadata, the validated input schema, and explainable scenario scoring. Current operational employees are not automatically scored or acted upon.

## API reference

There are three API classes:

1. **Browser-session APIs** are used by the HR and employee portals and require an Auth.js session.
2. **Integration APIs** are stable customer-facing contracts protected by scoped bearer credentials.
3. **Model/reference APIs** expose the historical model demonstration and health metadata.

The route files under `app/api` are the implementation source of truth. The customer integration contract is also published as OpenAPI 3.1 at `/api/v1/integrations/openapi`.

### Identity, health, and discovery

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET/POST | `/api/auth/[...nextauth]` | Public OAuth flow | Auth.js Google sign-in, callback, session, and sign-out |
| GET | `/api/v1/health` | Public | Embedded model and dataset health |
| GET | `/api/v1/ready` | Public | Release SHA, PostgreSQL, embedded model, and Azure AI configuration readiness |
| GET | `/api/v1/search?q=` | Workspace | Dynamic search across authorized pages, actions, and employee records |
| GET | `/api/v1/data-dictionary` | Model reference | Historical prediction input dictionary |
| GET | `/api/v1/schema` | Model reference | Prediction JSON schema |
| GET | `/api/v1/model` | Model reference | Version, metrics, ranges, features, and governance metadata |
| POST | `/api/v1/predict` | Model reference | Explainable historical-profile scenario score |
| GET | `/api/v1/dashboard` | Model reference | Historical validation dashboard projection |
| GET | `/api/v1/employees` | Model reference | Search and page historical scored records |

### HR workspace APIs

| Method | Endpoint | Primary role | Purpose |
|---|---|---|---|
| GET | `/api/v1/workforce` | Workspace | Filtered dashboard-safe workforce analytics |
| GET | `/api/v1/hr/inbox` | Workspace | Unified actor-scoped work queue |
| POST | `/api/v1/hr/workflows` | HR/manager | Create leave, position, learning, and related workflows |
| POST | `/api/v1/hr/workflows/action` | Assigned actor | Apply an authorized workflow transition |
| GET/POST | `/api/v1/hr/people` | HR | Search or create employee profiles |
| GET/PATCH | `/api/v1/hr/people/{employee_id}` | HR | Read or update a profile |
| POST | `/api/v1/hr/people/{employee_id}/management` | HR/manager | Compensation, project, review, and one-to-one operations |
| POST | `/api/v1/hr/people/{employee_id}/archive` | HR | End employment, revoke portal access, and retain the employee under the former population |
| POST | `/api/v1/hr/people/{employee_id}/restore` | HR | Restore an archived employee record |
| DELETE | `/api/v1/hr/people/{employee_id}` | Admin | Permanently delete a former employee and dependent records, release the identity for onboarding, and retain an audit event |
| GET | `/api/v1/hr/onboarding` | HR | Onboarding readiness and handoff queue |
| GET | `/api/v1/hr/hiring` | HR/manager | Requisition and candidate operations |
| PATCH | `/api/v1/hr/hiring/requisitions/{requisition_id}` | Authorized owner | Approve, decline, open, close, or update a requisition |
| POST | `/api/v1/hr/hiring/candidates` | HR | Add a candidate to a requisition |
| PATCH | `/api/v1/hr/hiring/candidates/{candidate_id}` | HR | Advance or update a candidate |
| GET | `/api/v1/hr/leave` | HR/manager | Leave register, pending decisions, schedule, and coverage |
| POST | `/api/v1/hr/leave/{leave_id}/decision` | Authorized approver | Approve or decline leave |
| GET/POST | `/api/v1/hr/learning` | HR/manager | Read operations or create cohort assignments |
| POST | `/api/v1/hr/learning/courses` | HR | Create a course and capability mapping |
| PATCH | `/api/v1/hr/learning/assignments/{assignment_id}` | Authorized actor | Complete or update an assignment |
| GET/POST | `/api/v1/hr/exits` | HR | List or schedule an employee exit and create its accountable checklist |
| GET/PATCH | `/api/v1/hr/exits/{exit_id}` | HR/manager | Read, update, cancel, or complete an exit workflow |
| PATCH | `/api/v1/hr/exits/{exit_id}/tasks/{task_id}` | Assigned actor | Advance an accountable offboarding task |
| GET/POST | `/api/v1/hr/assets` | Workspace/HR | Search inventory or create an asset |
| GET/PATCH | `/api/v1/hr/assets/{asset_id}` | Workspace/HR | Read custody history or update asset metadata |
| POST | `/api/v1/hr/assets/{asset_id}/assign` | HR | Assign an available asset to an employee |
| POST | `/api/v1/hr/assets/{asset_id}/return` | HR | Record return, condition, notes, and assignment closure |
| POST | `/api/v1/insights/actions` | HR | Persist an insight exception as owned work |
| PATCH | `/api/v1/insights/actions/{work_item_id}` | Authorized owner | Advance, resolve, or close an insight work item |
| GET | `/api/v1/insights/employee-impact` | HR | Searchable employee continuity and replacement scenario |
| GET | `/api/v1/retention/insights` | HR | Calculated retention cohort and operating evidence |
| POST | `/api/v1/retention/reviews` | HR | Create a governed retention review |
| PATCH | `/api/v1/retention/reviews/{review_id}` | Authorized owner | Update evidence, owner, action, follow-up, or status |
| GET/POST | `/api/v1/access/users` | Admin | List or authorize workspace users |
| PATCH/DELETE | `/api/v1/access/users/{email}` | Admin | Change role/status or remove access |
| GET | `/api/v1/admin/metrics` | Admin | Internal usage, integrations, Azure performance, and cost |

### Employee APIs

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/employee` | Return the signed-in employee workspace and request history |
| POST | `/api/v1/employee` | Submit leave, reimbursement, HR case, self-review, or one-to-one work |
| GET/POST | `/api/v1/employee/onboarding` | Read or submit the signed-in employee onboarding profile |
| GET/POST/DELETE | `/api/v1/employee/documents` | List, upload, download, or remove an authorized private document |

### Assistant, agents, and workflows

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/chat` | Stream a grounded page-aware answer, evidence trace, and optional workflow draft |
| GET | `/api/v1/chat/conversations` | List actor-owned conversations |
| GET/DELETE | `/api/v1/chat/conversations/{conversation_id}` | Load or delete an actor-owned conversation |
| GET | `/api/v1/agents` | Agent catalog and recent visible runs |
| POST | `/api/v1/agents/{agentId}/invoke` | Invoke one bounded read-only specialist agent |
| GET/POST | `/api/v1/ai/workflows` | List or create reviewed workflow drafts |
| POST | `/api/v1/ai/workflows/plan` | Convert an HR objective into a validated draft plan |
| POST | `/api/v1/ai/workflows/{workflow_id}` | Mark and audit the creator's external handoff |
| POST | `/api/v1/ai/workflows/{workflow_id}/execute` | Execute a confirmed internal or Calendar workflow |
| GET | `/api/v1/ai/integrations/google-calendar` | Report Calendar grant readiness |
| GET | `/api/v1/ai/integrations/microsoft-teams` | Report delegated Microsoft Teams calendar readiness |
| GET/POST/DELETE | `/api/mcp` | Authenticated Streamable HTTP MCP transport |

### Imports, reports, and feeds

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/data/status` | Domain counts, import jobs, failures, and last completion |
| GET | `/api/v1/data/template?domain=` | Download a CSV header contract |
| POST | `/api/v1/data/import` | Validate or apply a six-domain import |
| GET | `/api/v1/reports?format=pdf\|xlsx` | Decision-focused filtered report |
| GET | `/api/v1/power-bi/{domain}` | Authenticated CSV feed for a reporting connector |

### Customer integration API

Administrators create scoped clients from **Data exchange → Integration API**. A credential is shown once, stored only as a SHA-256 hash, can expire in 1–365 days, can be revoked, and is limited to 120 requests per minute. Every service request records client, route, status, duration, request ID, and time.

Use `Authorization: Bearer <service-credential>` and optionally pass `X-Request-ID`. Successful responses use:

```json
{
  "data": {},
  "meta": {
    "requestId": "caller-or-generated-id",
    "workspaceId": "org:laidbackhr",
    "generatedAt": "2026-08-11T00:00:00.000Z"
  }
}
```

| Method | Integration endpoint | Scope | Purpose |
|---|---|---|---|
| GET | `/api/v1/integrations/v1/capabilities` | `analytics:read` | Discover contract version, features, agents, filters, and limits |
| GET | `/api/v1/integrations/v1/workforce` | `analytics:read` | Workforce and decision-support measures |
| GET | `/api/v1/integrations/v1/insights?view=overview\|workforce-impact\|talent-supply\|capability` | `analytics:read` | Bounded reporting views from the shared analytics service |
| GET | `/api/v1/integrations/v1/retention` | `retention:read` | Retention cohorts and governed review state |
| GET | `/api/v1/integrations/v1/retention/model` | `retention:read` | Model card, metrics, input schema, and prohibited uses |
| POST | `/api/v1/integrations/v1/retention/predict` | `model:invoke` | Explainable historical-profile scenario score |
| GET | `/api/v1/integrations/v1/operations` | `operations:read` | Onboarding, leave, learning, and work queues |
| GET | `/api/v1/integrations/v1/exits` | `operations:read` | Confirmed exit register and offboarding progress |
| GET | `/api/v1/integrations/v1/assets` | `operations:read` | Asset inventory, custody, lifecycle, warranty, and replacement state |
| POST | `/api/v1/integrations/v1/agents/{agentId}/invoke` | `agent:invoke` | Audited read-only specialist agent |
| POST | `/api/v1/integrations/v1/data/import` | `data:write` | Validate or apply domain records through the governed importer |
| GET | `/api/v1/integrations/openapi` | Public contract | OpenAPI 3.1 contract |
| GET/POST | `/api/v1/integrations/clients` | Admin | List or create API clients |
| DELETE | `/api/v1/integrations/clients/{clientId}` | Admin | Revoke an API client |

The integration surface intentionally excludes direct approval and employee-status mutations. Customer systems can submit data, obtain analytics, invoke read-only agents, and use model scenarios, but cannot bypass the product's actor and approval model.

## Authentication and authorization

- Google OAuth, Google Identity ID-token sign-in, and Microsoft Entra sign-in are implemented with Auth.js.
- The canonical OAuth origin is `https://www.laidbackhr.cloud`; a shared secure cookie supports the employee subdomain.
- A verified Google or Microsoft identity must map to an active `app_users` row. A first-time employee can enter the controlled employee onboarding path; HR and administrator roles are never self-granted.
- Terminated and resigned employees remain linked to their identity so the employee portal can show the correct access-ended state. Permanent admin deletion clears that employee link and returns the identity to onboarding-required status.
- Supported application roles are administrator, HR, manager, viewer, and employee.
- Route handlers enforce role, record ownership, manager hierarchy, and assigned approver rules server-side.
- Private document operations use the application managed identity and authorization metadata; blob URLs are not public.
- Integration clients have independent, least-privilege scopes and do not inherit an interactive user session.
- Access changes, workflow decisions, imports, agent runs, and API requests are audited in PostgreSQL.

## Local development

### Prerequisites

- Node.js 22
- pnpm 11.20.0 through Corepack
- PostgreSQL 16
- Python 3.12 for model tests and retraining only
- Terraform 1.15.x for infrastructure validation

### Start the application

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.local.example .env.local
createdb laidbackhr
pnpm dev
```

Set a valid local `DATABASE_URL` and `DATABASE_SSL_MODE=disable` in `.env.local`. `LOCAL_UI_PREVIEW=true` allows the development workspace to use the configured bootstrap user without a production Google session. Do not enable that setting in production.

The application creates or upgrades the schema on first database access. To load demonstration records in a disposable local database, set `SEED_DEMO_DATA=true`. Production is pinned to `false`.

Azure AI and Blob Storage are optional for basic local development:

- without Azure OpenAI, the assistant uses deterministic evidence rendering;
- without Azure AI Search, it uses the embedded Markdown retriever; and
- without the employee-document storage account and identity, document operations report unavailable rather than writing to local disk.

## Configuration

Use `.env.local.example` as the local reference. Production values are set by Terraform; sensitive settings are App Service Key Vault references rather than plaintext application settings.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `DATABASE_SSL_MODE` | Local only | Set to `disable` for local PostgreSQL; Azure uses TLS |
| `DATABASE_SSL_REJECT_UNAUTHORIZED` | Optional | TLS certificate behavior; defaults to validation enabled |
| `DATABASE_POOL_MAX` | Optional | Per-process PostgreSQL pool size; production default is 10 |
| `AUTH_SECRET` | Yes | Auth.js signing secret |
| `AUTH_URL` / `NEXTAUTH_URL` | Production | Canonical public origin |
| `AUTH_COOKIE_DOMAIN` | Production | Shared `.laidbackhr.cloud` secure cookie domain |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Production sign-in | Google OAuth web client |
| `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_NAME` | Initial deployment | Initial administrator identity |
| `LOCAL_UI_PREVIEW` | Local only | Enables local actor fallback; never enable in production |
| `SEED_DEMO_DATA` | Optional | Load/reconcile demo records in a disposable environment |
| `ANALYTICS_CACHE_TTL_MS` | Optional | Production analytics cache duration |
| `EMPLOYEE_DOCUMENTS_ACCOUNT_URL` | Document operations | Azure Blob account endpoint |
| `EMPLOYEE_DOCUMENTS_CONTAINER` | Optional | Private container name |
| `AZURE_AI_SEARCH_ENDPOINT` / `AZURE_AI_SEARCH_API_KEY` / `AZURE_AI_SEARCH_INDEX` | Azure RAG | Hybrid/vector knowledge retrieval |
| `AZURE_OPENAI_ENDPOINT` / `AZURE_OPENAI_API_KEY` / `AZURE_OPENAI_MODEL` | Azure synthesis | Grounded generation and schema-constrained planning |
| `AZURE_OPENAI_EMBEDDING_ENDPOINT` / `AZURE_OPENAI_EMBEDDING_API_KEY` / `AZURE_OPENAI_EMBEDDING_MODEL` | Vector retrieval | Query and ingestion embeddings |
| `AZURE_SUBSCRIPTION_ID` / `AZURE_RESOURCE_GROUP` | Admin monitor | Azure Cost Management query scope |
| `AZURE_LOG_ANALYTICS_WORKSPACE_ID` | Admin monitor | Application performance query scope |
| `APP_VERSION` | Deployment | Immutable Git SHA reported by readiness |

Never commit `.env.local`, API credentials, downloaded Key Vault values, Terraform plan/state files, or employee exports.

## Validation

### Web and workflow validation

```bash
pnpm test:interactions
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/laidbackhr_test \
  DATABASE_SSL_MODE=disable \
  pnpm test:operations
pnpm test:knowledge
pnpm lint
pnpm exec tsc --noEmit
pnpm build:azure
```

### Compiled live checks

Start the compiled application with a test PostgreSQL database, then run:

```bash
LAIDBACKHR_BASE_URL=http://127.0.0.1:3000 pnpm test:live
LAIDBACKHR_BASE_URL=http://127.0.0.1:3000 pnpm test:ai-redteam
LAIDBACKHR_BASE_URL=http://127.0.0.1:3000 pnpm test:concurrency
```

The live suites cover route readiness, actor workflows, prompt injection, cross-actor leakage, excessive agency, output grounding, and concurrent browsing.

### Model validation

```bash
python -m pip install -r backend/requirements.txt -r backend/requirements-dev.txt
cd backend
PYTHONPATH=. python -m pytest -q
```

`pnpm model:export` exports an approved Python artifact to the TypeScript runtime after retraining. Review `backend/MODEL_CARD.md` and the metadata diff before committing a model change.

### Infrastructure validation

```bash
terraform -chdir=infra init -backend=false
terraform -chdir=infra fmt -check -recursive
terraform -chdir=infra validate
```

## Deployment

### Release ownership

GitHub Actions is the single production deployment owner. Azure DevOps provides an independent validation record for the mirrored commit and confirms that the identical immutable SHA is live. It does not apply Terraform or deploy a competing image.

```mermaid
flowchart LR
    Commit["Commit to main"] --> GH["GitHub Actions validation"]
    Commit --> Mirror["Azure Repos main mirror"]
    GH --> Image["Build immutable image\nTag = Git SHA"]
    Image --> ACR["Azure Container Registry"]
    GH --> Terraform["Terraform plan and apply"]
    Terraform --> App["Azure App Service"]
    GH --> Search["Synchronize AI Search index"]
    App --> Ready["Readiness verifies exact SHA"]
    Mirror --> AzDO["Azure DevOps validation"]
    AzDO --> Ready
```

### GitHub Actions production workflow

`.github/workflows/production.yml` runs on pull requests and `main`:

1. Install locked Node dependencies.
2. Run interaction, PostgreSQL operational, knowledge, lint, TypeScript, build, live, AI red-team, and concurrency checks.
3. Run the Python model test suite.
4. Validate Terraform.
5. Authenticate to Azure using GitHub OIDC.
6. copy the protected Azure AI settings into the application Key Vault;
7. build and push `laidbackhr-web:<git-sha>` to ACR;
8. apply `infra/environments/production/production.tfvars` with remote state;
9. synchronize and probe the Azure AI Search index; and
10. require three consecutive readiness responses for the deployed SHA.

The GitHub `production` environment must contain:

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`
- `AI_SEARCH_KEY`
- `AI_SEARCH_ENDPOINT`
- `AZURE_OPENAI_KEY`
- `AZURE_OPENAI_ENDPOINT`
- `AZURE_EMBEDDING_KEY`
- `AZURE_EMBEDDING_ENDPOINT`

### Azure DevOps validation

`azure-pipelines.yml` runs the same application, PostgreSQL workflow, model, AI safety, concurrency, and Terraform validation against Azure Repos `main`. Its deployment-evidence stage waits for `https://www.laidbackhr.cloud/api/v1/ready` to report `Build.SourceVersion`.

Both repositories must point `main` at the same commit before a release is considered synchronized.

### Terraform

Terraform reads the existing resource group rather than creating a second one. Remote state is configured by `infra/environments/production/backend.hcl`; production values are in `infra/environments/production/production.tfvars`.

Manual planning for authorized operators:

```bash
terraform -chdir=infra init -reconfigure \
  -backend-config=environments/production/backend.hcl
terraform -chdir=infra plan \
  -var-file=environments/production/production.tfvars \
  -var="image_tag=$(git rev-parse HEAD)"
```

Do not run a local apply while the GitHub production workflow is active. The remote state lock protects infrastructure, but the deployment pipeline remains the release owner.

## Operations

### Health endpoints

```bash
curl --fail https://www.laidbackhr.cloud/api/v1/health
curl --fail https://www.laidbackhr.cloud/api/v1/ready
```

`/api/v1/ready` must report:

- `status: ready`;
- the expected Git commit in `version`;
- `database.engine: postgresql`;
- the embedded model version; and
- separate Azure AI Search, embedding, and generation configuration flags.

### Administrator monitor

`/admin` combines:

- current users, open/completed workflows, imports, integration clients, and audited API requests from PostgreSQL;
- request and dependency performance from Log Analytics/Application Insights; and
- month-to-date resource-group cost through Azure Cost Management.

The App Service managed identity requires `Monitoring Reader` and `Cost Management Reader` on `Laidback.ai`. If an Azure provider is unavailable, the page still returns internal operational metrics and an explicit provider error instead of failing the entire monitor.

### Performance controls

- PostgreSQL uses a bounded connection pool (`DATABASE_POOL_MAX=10`).
- Expensive analytics share a 30-second production cache and route responses allow short private caching.
- Azure AI Search results are cached for five minutes and remote calls have strict timeouts.
- Azure Cost Management is queried at most once daily; the last successful snapshot and provider retry window are shared through PostgreSQL so refreshes and restarts cannot amplify throttling.
- MCP runs in-process for the assistant, eliminating a network hop.
- The prediction model is embedded in the web container, eliminating a second App Service.
- Docker builds use GitHub cache and immutable SHA tags.
- App Service health checking evicts unhealthy workers; `always_on` avoids cold-start suspension on the current plan.

## Repository structure

```text
app/                         Next.js pages, layouts, and route handlers
components/                  Shared HR, employee, chart, form, and assistant UI
lib/                         Domain types, clients, and server business services
  server/                    PostgreSQL, analytics, workflows, AI, MCP, export, and Azure adapters
db/postgres/                 Ordered PostgreSQL migrations
knowledge/                   System prompt and curated RAG operating guides
backend/                     Python training/test reference, model artifact, dataset, and model card
scripts/                     Model export, AI Search ingestion, audits, and end-to-end validation
tests/                       Compiled live, concurrency, and AI red-team tests
infra/                       Terraform for the existing Azure resource group
.github/workflows/           GitHub validation and production deployment
azure-pipelines.yml          Azure Repos mirror validation and deployment evidence
Dockerfile                   Standalone Node production image
```

## Responsible use

Attrition scores are statistical review signals, not facts about a person's future behavior. The application separates recorded outcomes, model estimates, retrieved guidance, and human-entered evidence. It does not automatically change compensation, promotion, performance, learning, access, or employment status from a score or AI response.

Before using the model with a new organization's data, qualified reviewers must validate data quality, calibration, subgroup performance, drift, review capacity, lawful basis, and employee-notice requirements. Human decision-makers remain accountable for every material employment action.
