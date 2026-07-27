# LaidbackHR.AI

LaidbackHR.AI is a real-data HR attrition analytics application with explainable predictions, a grounded analytics agent, and human-reviewed action workflows.

The application uses all 1,470 rows from the supplied IBM HR sample dataset. It does not substitute names, job titles, managers, locations, dates, or other fields that are absent from the source.

## Production architecture

The deployed application is a single Cloudflare-compatible web runtime:

- Next.js-compatible pages are built with Vinext.
- The persisted scikit-learn pipeline is exported into an equivalent TypeScript inference runtime.
- Predictions from the web runtime are parity-tested against the Python model.
- Dashboard values, anonymised scored records, model metadata, and the analytics agent are grounded in the exported dataset and model.
- Review-action status is stored in D1 and survives sessions and deployments.
- The original FastAPI backend remains in `backend/` as the reproducible training and reference implementation.

## What is real

- All 1,470 historical rows are scored by the deployed model.
- `POST /api/v1/predict` runs the real logistic-regression coefficients and preprocessing statistics.
- The analytics agent answers only from verified dashboard and model facts.
- Review actions are derived from real cohorts and have durable, human-controlled statuses.
- Dashboard KPIs, department risk, tenure cohorts, model signals, risk distribution, and data provenance come from the supplied CSV.
- Age and marital status are excluded from training.

The dataset has no employee names, job titles, managers, locations, dates, hiring events, leave records, training records, promotion records, or exit reasons. Unsupported sections from the original mock app were replaced with auditable alternatives.

## Local development

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

The production API is same-origin, so `NEXT_PUBLIC_API_BASE_URL` should normally remain blank. Set it only when deliberately running the optional FastAPI service separately.

## Verification

Run strict TypeScript checks and the production build:

```bash
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
| GET | `/api/v1/employees` | Filterable anonymised scored rows |
| GET | `/api/v1/actions` | Data-derived review actions |
| POST | `/api/v1/actions/{id}` | Persist a review action status |
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

Risk scores are statistical estimates, not facts or automated employment decisions. Before using real employee data, add identity and role controls, encryption, audit logging, governed data retention, fairness testing, drift monitoring, employee or works-council review where applicable, and a documented human-review process.
