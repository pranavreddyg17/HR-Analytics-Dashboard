# LaidbackHR.AI

LaidbackHR.AI is an Azure-hosted people-operations and workforce-intelligence platform. It combines operational HR workflows, employee self-service, explainable attrition analysis, reporting, and auditable AI agents in one application.

## Azure production architecture

All runtime resources are provisioned in the existing `Laidback.ai` resource group:

- Azure App Service runs the Next.js application. The validated prediction artifact executes in-process, avoiding a second always-on container on the cost-controlled service plan.
- Azure Database for PostgreSQL Flexible Server is the system of record. Versioned SQL migrations run idempotently at application startup.
- Azure Blob Storage holds private employee documents. Access uses the web app's managed identity; account keys and public blob access are disabled.
- Azure Key Vault stores database, authentication, Google OAuth, Azure OpenAI, embedding, and Azure AI Search configuration.
- Azure AI Search indexes the curated Markdown knowledge base for hybrid/vector retrieval.
- Azure OpenAI provides grounded synthesis when a chat deployment is configured. The assistant retains a deterministic, evidence-only fallback if generation is unavailable.
- Azure Container Registry stores immutable web and model images.
- Application Insights and Log Analytics collect platform telemetry.
- Terraform owns the Azure resources and GitHub Actions is the only deployment pipeline.

Production demo seeding is disabled. Existing PostgreSQL records are preserved; new migrations add structures without replacing operational rows.

## Product surfaces

- `/` — HR work requiring attention and upcoming workforce events
- `/people` — employee directory and employee administration
- `/inbox` — approvals and assigned work across hiring, leave, learning, reimbursement, employee cases, and insight reviews
- `/hiring` — requisitions and the candidate pipeline
- `/leaves` — requests, decisions, absence schedules, and coverage
- `/courses` — course catalog, assignments, completion, and compliance
- `/insights` — aggregate workforce movement, coverage, cost, and capability analysis
- `/attrition` and `/risk-review` — governed model assessment and review worklists
- `/assistant` — grounded analytics assistant with conversation memory and a visible evidence trace
- `/imports` — validated imports, exports, and reporting feeds
- `/access` — workspace membership and roles
- `/employee` — employee self-service for profile, leave, reimbursements, HR cases, documents, reviews, and one-to-ones

The employee portal can use the same application at `employee.laidbackhr.cloud`. Authentication cookies are shared only across the `laidbackhr.cloud` domain.

## Relational model

The PostgreSQL schema separates identities and slowly changing business records:

- employees and application users
- effective-dated compensation
- projects and employee project assignments
- private employee document metadata
- requisitions, candidates, leave requests, learning assignments, and promotions
- reimbursement claims and confidential employee cases
- review cycles, performance reviews, and one-to-one meetings
- workflow requests, action history, AI conversations, agent runs, and agent steps

Legacy compatibility columns remain in the employee import surface while the normalized tables are adopted. Derived analytics such as tenure, attrition rate, vacancy rate, replacement rate, and cost scenarios are calculated at read time rather than persisted as operational facts.

## AI agents

The agent catalog is available from `GET /api/v1/agents`. Each agent is invoked through `POST /api/v1/agents/{agentId}/invoke`:

- `workforce-intelligence`
- `retention-planner`
- `recruiting-operations`
- `learning-compliance`
- `people-operations`

Every invocation is authenticated, role-scoped, grounded through HR tools and the current workspace, and stored in `agent_runs` with ordered tool steps. The orchestrator can perform a bounded multi-step loop—for example, connecting attrition evidence to mobility and relevant learning records—without allowing autonomous employment decisions.

The employee assistant and future integrations should use these APIs instead of duplicating agent logic.

## API overview

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/health` | Model and dataset health |
| GET | `/api/v1/ready` | Web, PostgreSQL, model service, and AI configuration readiness |
| GET/POST | `/api/v1/hr/people` | Search or create employee profiles |
| GET/PATCH | `/api/v1/hr/people/{id}` | Read or update an employee profile |
| POST | `/api/v1/hr/people/{id}/management` | Compensation, project, review, and one-to-one operations |
| GET | `/api/v1/hr/inbox` | Unified role-scoped work queue |
| GET | `/api/v1/hr/hiring` | Requisitions and candidates |
| GET | `/api/v1/hr/leave` | Leave register and coverage |
| GET/POST | `/api/v1/hr/learning` | Learning assignments |
| GET | `/api/v1/workforce` | Dashboard-safe aggregate workforce projection |
| GET | `/api/v1/reports` | Decision-focused PDF or Excel export |
| GET | `/api/v1/employee` | Signed-in employee workspace |
| POST | `/api/v1/employee` | Leave, reimbursement, case, and self-review requests |
| POST/GET | `/api/v1/employee/documents` | Private employee document upload/download |
| GET | `/api/v1/agents` | Agent capability catalog |
| POST | `/api/v1/agents/{agentId}/invoke` | Audited agent invocation |
| POST | `/api/v1/chat` | Conversational agent with workspace memory |
| GET/POST/DELETE | `/api/mcp` | Streamable HTTP MCP tools |

## Local development

Prerequisites are Node.js 22+, pnpm, Python 3.12, and PostgreSQL 16.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev:azure
```

Use `.env.local.example` as the local configuration reference. Never commit secrets.

## Validation

```bash
pnpm lint
pnpm exec tsc --noEmit
pnpm build:azure

python -m pip install -r backend/requirements.txt -r backend/requirements-dev.txt
cd backend
PYTHONPATH=. python -m pytest -q

terraform -chdir=infra init -backend=false
terraform -chdir=infra fmt -check -recursive
terraform -chdir=infra validate
```

## Deployment

`.github/workflows/production.yml` validates pull requests and deploys `azure/migration` through GitHub OpenID Connect. The deployment:

1. validates the web app, Python reference model, and Terraform;
2. copies approved AI values from protected GitHub environment secrets into the application Key Vault;
3. builds and pushes immutable images to Azure Container Registry;
4. applies Terraform using remote state;
5. synchronizes the Azure AI Search knowledge index; and
6. verifies both service health endpoints.

The GitHub `production` environment must contain the Azure OIDC identifiers and the approved Azure AI secret values. The application Key Vault remains the only runtime secret source.

To enable `employee.laidbackhr.cloud`, first create the DNS records described in `infra/environments/production/README.md`, add the origin to Google OAuth, then set `enable_employee_custom_domain = true` in the production variables and run the pipeline.

## Responsible use

Attrition scores are review signals, not employment decisions or claims about future behavior. The application separates observed outcomes, model estimates, and human-entered evidence. It never automatically changes pay, promotion, performance, or employment status from a model score. Restricted records remain role-scoped and all material actions are attributable.
