import { ensureHrDatabase } from "@/lib/server/hr-repository"

export type OperationalRetentionFactor = {
  code: "compensation_position" | "role_tenure" | "manager_support" | "workload" | "staffing_pressure" | "delivery_continuity" | "one_on_one_recency"
  label: string
  points: number
  evidence: string
  reviewAction: string
}

export type OperationalRetentionEvidence = {
  employeeId: string
  name: string
  department: string
  jobTitle: string
  location: string
  reviewScore: number
  reviewLevel: "Priority" | "Watch" | "Monitor"
  evidenceCoverage: number
  factors: OperationalRetentionFactor[]
  recommendedReview: string
  projectContext: { allocationPercent: number | null; criticality: string | null; deliveryImpact: string | null }
}

type EvidenceRow = {
  employee_id: string
  display_name: string
  department: string
  job_title: string
  location: string
  annual_salary: number | null
  cohort_median_salary: number | null
  compensation_cohort_size: number
  role_tenure_years: number
  manager_rating: number | null
  latest_review_at: string | null
  allocation_percent: number | null
  project_criticality: string | null
  delivery_impact: string | null
  last_one_on_one: string | null
  one_on_one_count: number
  active_department_headcount: number
  open_department_roles: number
}

function daysSince(value: string | null): number | null {
  if (!value) return null
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000)) : null
}

function priority(score: number): OperationalRetentionEvidence["reviewLevel"] {
  return score >= 50 ? "Priority" : score >= 25 ? "Watch" : "Monitor"
}

export async function getOperationalRetentionEvidence(limit = 100): Promise<{
  generatedAt: string
  policy: { id: string; version: string; intendedUse: string; excludedEvidence: string[] }
  records: OperationalRetentionEvidence[]
}> {
  const database = await ensureHrDatabase()
  const result = await database.prepare(`
    WITH current_compensation AS (
      SELECT DISTINCT ON (employee_id) employee_id, annual_salary
      FROM employee_compensation
      WHERE effective_from<=CURRENT_DATE AND (effective_to IS NULL OR effective_to>=CURRENT_DATE)
      ORDER BY employee_id, effective_from DESC, created_at DESC
    ), compensation_cohorts AS (
      SELECT e.job_title, e.location, COUNT(c.employee_id) AS cohort_size,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY c.annual_salary) AS median_salary
      FROM employee_directory_view e JOIN current_compensation c ON c.employee_id=e.employee_id
      WHERE e.archived_at IS NULL AND LOWER(e.employment_status) IN ('active','on leave','on bench','notice period')
      GROUP BY e.job_title, e.location
    ), latest_review AS (
      SELECT DISTINCT ON (employee_id) employee_id, manager_rating, completed_at
      FROM performance_reviews WHERE status='completed'
      ORDER BY employee_id, completed_at DESC NULLS LAST, updated_at DESC
    ), promotion AS (
      SELECT employee_id, MAX(promotion_date::date) AS last_promotion_date
      FROM promotion_records GROUP BY employee_id
    ), project_context AS (
      SELECT a.employee_id, SUM(a.allocation_percent) AS allocation_percent,
        CASE MAX(CASE p.business_criticality WHEN 'critical' THEN 3 WHEN 'important' THEN 2 ELSE 1 END)
          WHEN 3 THEN 'critical' WHEN 2 THEN 'important' ELSE 'standard' END AS project_criticality,
        STRING_AGG(DISTINCT p.delivery_impact, '; ') FILTER (WHERE p.delivery_impact IS NOT NULL) AS delivery_impact
      FROM employee_project_assignments a JOIN projects p ON p.id=a.project_id
      WHERE p.status='active' AND a.starts_on<=CURRENT_DATE AND (a.ends_on IS NULL OR a.ends_on>=CURRENT_DATE)
      GROUP BY a.employee_id
    ), one_on_one AS (
      SELECT employee_id, COUNT(*) FILTER (WHERE status='completed') AS meeting_count,
        MAX(COALESCE(held_at, scheduled_at)) FILTER (WHERE status='completed') AS last_meeting
      FROM one_on_one_meetings GROUP BY employee_id
    ), department_capacity AS (
      SELECT department, COUNT(*) AS active_headcount
      FROM employee_directory_view
      WHERE archived_at IS NULL AND LOWER(employment_status) IN ('active','on leave','on bench','notice period')
      GROUP BY department
    ), department_hiring AS (
      SELECT department, COUNT(*) AS open_roles FROM hiring_records
      WHERE LOWER(recruitment_status) IN ('requested','approved','open','offer')
      GROUP BY department
    )
    SELECT e.employee_id,
      TRIM(COALESCE(NULLIF(e.preferred_name,''),e.first_name) || ' ' || e.last_name) AS display_name,
      e.department, e.job_title, e.location,
      c.annual_salary, cc.median_salary AS cohort_median_salary, COALESCE(cc.cohort_size,0) AS compensation_cohort_size,
      GREATEST(0, EXTRACT(EPOCH FROM AGE(CURRENT_DATE, GREATEST(e.hire_date::date, COALESCE(p.last_promotion_date,e.hire_date::date)))) / 31557600.0) AS role_tenure_years,
      r.manager_rating, r.completed_at AS latest_review_at,
      pc.allocation_percent, pc.project_criticality, pc.delivery_impact,
      o.last_meeting AS last_one_on_one, COALESCE(o.meeting_count,0) AS one_on_one_count,
      COALESCE(dc.active_headcount,0) AS active_department_headcount,
      COALESCE(dh.open_roles,0) AS open_department_roles
    FROM employee_directory_view e
    LEFT JOIN current_compensation c ON c.employee_id=e.employee_id
    LEFT JOIN compensation_cohorts cc ON cc.job_title=e.job_title AND cc.location=e.location
    LEFT JOIN latest_review r ON r.employee_id=e.employee_id
    LEFT JOIN promotion p ON p.employee_id=e.employee_id
    LEFT JOIN project_context pc ON pc.employee_id=e.employee_id
    LEFT JOIN one_on_one o ON o.employee_id=e.employee_id
    LEFT JOIN department_capacity dc ON dc.department=e.department
    LEFT JOIN department_hiring dh ON dh.department=e.department
    WHERE e.archived_at IS NULL AND LOWER(e.employment_status) IN ('active','on leave','on bench','notice period')
    ORDER BY e.employee_id
  `).all<EvidenceRow>()

  const records = (result.results ?? []).map((row): OperationalRetentionEvidence => {
    const factors: OperationalRetentionFactor[] = []
    if (row.annual_salary !== null && row.cohort_median_salary !== null && row.compensation_cohort_size >= 5 && row.annual_salary < row.cohort_median_salary * 0.85) {
      factors.push({ code: "compensation_position", label: "Compensation review", points: 20, evidence: `Current salary is ${Math.round((1 - row.annual_salary / row.cohort_median_salary) * 100)}% below the role-and-location median across ${row.compensation_cohort_size} records.`, reviewAction: "Validate level, location, performance, and pay-band evidence with compensation before taking action." })
    }
    if (Number(row.role_tenure_years) >= 3) {
      factors.push({ code: "role_tenure", label: "Role tenure", points: Number(row.role_tenure_years) >= 5 ? 18 : 12, evidence: `${Number(row.role_tenure_years).toFixed(1)} years since the recorded hire or promotion date.`, reviewAction: "Confirm career interests, role scope, and internal mobility preferences in a human conversation." })
    }
    if (row.manager_rating !== null && Number(row.manager_rating) <= 2.5) {
      factors.push({ code: "manager_support", label: "Manager review evidence", points: 15, evidence: `Latest completed manager rating is ${Number(row.manager_rating).toFixed(1)} of 5.`, reviewAction: "Review the completed evaluation and agreed support plan; do not treat the rating as a resignation cause." })
    }
    if (row.allocation_percent !== null && Number(row.allocation_percent) > 110) {
      factors.push({ code: "workload", label: "Recorded allocation", points: 20, evidence: `${Number(row.allocation_percent).toFixed(0)}% active project allocation is recorded.`, reviewAction: "Validate actual workload, delivery dates, and capacity with the employee and project owners." })
    }
    const vacancyShare = row.active_department_headcount ? row.open_department_roles / row.active_department_headcount : 0
    if (vacancyShare >= 0.1) {
      factors.push({ code: "staffing_pressure", label: "Staffing pressure", points: vacancyShare >= 0.2 ? 16 : 10, evidence: `${row.open_department_roles} open roles for ${row.active_department_headcount} active department employees.`, reviewAction: "Reconcile approved hiring, workload coverage, and succession plans for the team." })
    }
    if (row.project_criticality === "critical" && vacancyShare >= 0.05) {
      factors.push({ code: "delivery_continuity", label: "Delivery continuity", points: 12, evidence: `A critical project assignment is linked${row.delivery_impact ? `: ${row.delivery_impact}` : "."}`, reviewAction: "Confirm a named backup, knowledge-transfer plan, and delivery contingency without using project importance as an employment rating." })
    }
    const meetingAge = daysSince(row.last_one_on_one)
    if (row.one_on_one_count > 0 && meetingAge !== null && meetingAge > 120) {
      factors.push({ code: "one_on_one_recency", label: "Manager check-in recency", points: 8, evidence: `The latest completed one-on-one was ${meetingAge} days ago.`, reviewAction: "Schedule a confidential check-in and record employee-agreed follow-up actions." })
    }
    const score = Math.min(100, factors.reduce((sum, factor) => sum + factor.points, 0))
    const evidenceCoverage = Math.round(([
      row.annual_salary !== null && row.compensation_cohort_size >= 5,
      Number.isFinite(Number(row.role_tenure_years)),
      row.manager_rating !== null,
      row.allocation_percent !== null,
      row.active_department_headcount > 0,
      row.one_on_one_count > 0,
    ].filter(Boolean).length / 6) * 100)
    const sorted = factors.sort((left, right) => right.points - left.points)
    return {
      employeeId: row.employee_id,
      name: row.display_name,
      department: row.department,
      jobTitle: row.job_title,
      location: row.location,
      reviewScore: score,
      reviewLevel: priority(score),
      evidenceCoverage,
      factors: sorted,
      recommendedReview: sorted[0]?.reviewAction ?? "No operational review trigger is present in the recorded evidence.",
      projectContext: { allocationPercent: row.allocation_percent === null ? null : Number(row.allocation_percent), criticality: row.project_criticality, deliveryImpact: row.delivery_impact },
    }
  }).sort((left, right) => right.reviewScore - left.reviewScore || right.evidenceCoverage - left.evidenceCoverage || left.name.localeCompare(right.name))

  return {
    generatedAt: new Date().toISOString(),
    policy: {
      id: "operational-retention-review",
      version: "1.0.0",
      intendedUse: "Prioritize voluntary human review from current compensation, career, performance, staffing, project, and manager-support evidence. This is not a probability of resignation.",
      excludedEvidence: ["Protected characteristics", "Leave usage", "Education", "Number of prior employers", "Historical model probability"],
    },
    records: records.slice(0, Math.max(1, Math.min(500, limit))),
  }
}
