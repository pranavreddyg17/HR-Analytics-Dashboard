# LaidbackHR.AI

LaidbackHR.AI is a people-operations workspace for employee records, hiring, time off, training, promotions, workforce analytics, explainable attrition-risk review, and grounded AI assistance.

It deliberately separates two kinds of data:

- Live HR records stored in D1 and managed through People, Inbox, Data Hub, and Insights.
- The supplied 1,470-row IBM sample dataset, used only by the validated historical attrition model and its clearly labelled review surface.

## Production architecture

The deployed application is a single Cloudflare-compatible web runtime:

- Next.js-compatible pages are built with Vinext.
- The private Sites access gate provides ChatGPT sign-in, and the authenticated identity is attached to employee changes and leave decisions.
- Employee profiles, reporting lines, soft archival, operational HR domains, approvals, imports, and activity history are stored in D1.
- The persisted scikit-learn pipeline is exported into an equivalent TypeScript inference runtime.
- Predictions from the web runtime are parity-tested against the Python model.
- Five focused MCP tools ground a LangChain agent across workforce summaries, department comparisons, attrition signals, people operations, and employee lookup.
- A small Markdown knowledge base supplies HR metric definitions and responsible-use guidance through lightweight retrieval.
- Approval-based Google Calendar and Gmail draft workflows use operational employee email records without sending or scheduling automatically.
- Reports export to PDF and Excel, while domain feeds support Power BI refreshes.
- The original FastAPI backend remains in `backend/` as the reproducible training and reference implementation.

## Product surfaces

- `/` — personalized My Day home with priorities and workforce pulse
- `/people` — searchable employee directory and add-employee workflow
- `/people/{id}` — profile, reporting line, time off, growth, and attributable activity
- `/inbox` — leave approvals plus hiring, training, and human-review follow-ups
- `/insights` — employee, hiring, attrition, leave, training, promotion, and executive analytics
- `/attrition` and `/risk-review` — governed historical model diagnostics and anonymized review rows
- `/ai-agents` — grounded LangChain + MCP copilot with a visible tool trace
- `/data` — imports, templates, data readiness, and Power BI feeds

## Data truth

- All 1,470 historical rows are scored by the deployed model.
- `POST /api/v1/predict` runs the real logistic-regression coefficients and preprocessing statistics.
- The LangChain agent calls MCP tools and answers from the returned HR analytics evidence.
- Employee and leave mutations are durable and write an attributable activity entry.
- Imports replace demo rows one HR domain at a time and remain labelled by source.
- Age and marital status are excluded from training.

The IBM source dataset has no employee names, managers, locations, dates, hiring events, leave records, training records, promotion records, or exit reasons. For that reason, the initial operational workspace contains conspicuously labelled demo records until an HR team adds or imports its own data. Demo identities never become attrition-model identities.

## Local development

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

The production API is same-origin, so `NEXT_PUBLIC_API_BASE_URL` should normally remain blank. Set it only when deliberately running the optional FastAPI service separately.

## Verification

Run lint, strict TypeScript checks, and the production build:

```bash
pnpm lint
pnpm exec tsc --noEmit
pnpm build
```

With the local application running:

```bash
pnpm test:live
```

Run the Python reference tests:

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
PYTHONPATH=. .venv/bin/python -m pytest -q
```

Regenerate the worker model artifact after retraining:

```bash
cd backend
PYTHONPATH=. .venv/bin/python scripts/train_model.py
PYTHONPATH=. .venv/bin/python scripts/export_worker_runtime.py
```

## API endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/health` | Service, model, dataset, and capability health |
| GET | `/api/v1/dashboard` | Real dashboard aggregates |
| GET | `/api/v1/model` | Model metrics and provenance |
| GET | `/api/v1/schema` | Predictor ranges and categories |
| POST | `/api/v1/predict` | Score one employee profile |
| GET | `/api/v1/employees` | Filterable anonymised historical model rows |
| GET/POST | `/api/v1/hr/people` | Search or create managed employee profiles |
| GET/PATCH | `/api/v1/hr/people/{id}` | Read or edit one employee profile |
| POST | `/api/v1/hr/people/{id}/archive` | Soft-archive an employee |
| POST | `/api/v1/hr/people/{id}/restore` | Restore an archived employee |
| GET | `/api/v1/hr/inbox` | Unified HR work queue |
| POST | `/api/v1/hr/leave/{id}/decision` | Approve or reject leave with audit history |
| GET | `/api/v1/workforce` | Filtered seven-view workforce analytics |
| POST | `/api/v1/data/import` | Authenticated domain import |
| GET | `/api/v1/reports` | PDF or Excel report export |
| GET | `/api/v1/power-bi/{domain}` | Power BI-ready CSV feed |
| GET/POST/DELETE | `/api/mcp` | Streamable HTTP MCP endpoint with five focused HR tools |
| GET/POST | `/api/v1/ai/workflows` | List or prepare Calendar and Gmail employee workflows |
| POST | `/api/v1/chat` | Grounded analytics agent |
| GET | `/api/v1/data-dictionary` | Source schema and model-use flags |

## Model results

- ROC-AUC: 0.71
- Precision: 0.31
- Recall: 0.54
- F1: 0.39
- Review threshold: 21%
- Evaluation: five-fold stratified out-of-fold

The limited sample is suitable for demonstrating a working architecture, not for production employment decisions.

## Responsible-use boundary

Risk scores are statistical estimates, not facts or automated employment decisions. The current private workspace adds signed-in identity, mutation authorization, soft archival, audit history, and model/live-data separation. Before a multi-team production rollout, add organization-scoped roles, a verified enterprise identity provider where required, governed retention, fairness and drift monitoring, regional privacy review, and a documented human-review process.
