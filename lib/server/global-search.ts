import type { RequestActor } from "@/lib/server/request-user"
import { ensureHrDatabase } from "@/lib/server/hr-repository"

type GlobalSearchResult = {
  id: string
  href: string
  label: string
  detail: string
  section: "People" | "Onboarding" | "Leaves" | "Learning" | "Work"
  kind: "person" | "record"
  initials?: string
}

type SearchRow = {
  id: string
  label: string
  detail: string
  href: string
  initials?: string | null
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("")
}

export async function searchWorkspace(query: string, actor: RequestActor): Promise<GlobalSearchResult[]> {
  const normalized = query.trim().toLowerCase()
  if (normalized.length < 2) return []
  const database = await ensureHrDatabase()
  if (!database) return []
  const pattern = `%${normalized}%`

  const [people, requisitions, candidates, leave, learning, work] = await Promise.all([
    database.prepare(`
      SELECT employee_id AS id,
        TRIM(COALESCE(NULLIF(preferred_name, ''), first_name) || ' ' || last_name) AS label,
        job_title || ' · ' || department AS detail,
        '/people/' || employee_id AS href
      FROM employee_directory_view
      WHERE archived_at IS NULL
        AND LOWER(employee_id || ' ' || first_name || ' ' || last_name || ' ' ||
          COALESCE(preferred_name, '') || ' ' || COALESCE(work_email, '') || ' ' ||
          job_title || ' ' || department || ' ' || location) LIKE ?
      ORDER BY CASE employment_status WHEN 'Active' THEN 0 WHEN 'Pending start' THEN 1 WHEN 'Preboarding' THEN 1 ELSE 2 END, label
      LIMIT 6
    `).bind(pattern).all<SearchRow>(),
    database.prepare(`
      SELECT id, position AS label,
        department || ' · ' || location || ' · ' || recruitment_status AS detail,
        '/onboarding?view=talent&requisition=' || id AS href
      FROM hiring_requisitions_view
      WHERE LOWER(id || ' ' || position || ' ' || department || ' ' || location ||
        ' ' || recruitment_status || ' ' || hiring_source) LIKE ?
      ORDER BY CASE LOWER(recruitment_status) WHEN 'requested' THEN 0 WHEN 'open' THEN 1 WHEN 'offer' THEN 2 ELSE 3 END,
        application_date DESC
      LIMIT 5
    `).bind(pattern).all<SearchRow>(),
    database.prepare(`
      SELECT id, full_name AS label,
        stage || ' · ' || email AS detail,
        '/onboarding?view=talent&candidateRecord=' || id AS href
      FROM candidate_applications_view
      WHERE LOWER(id || ' ' || full_name || ' ' || email || ' ' || stage ||
        ' ' || source || ' ' || next_step) LIKE ?
      ORDER BY updated_at DESC
      LIMIT 5
    `).bind(pattern).all<SearchRow>(),
    database.prepare(`
      SELECT l.id,
        TRIM(COALESCE(NULLIF(e.preferred_name, ''), e.first_name) || ' ' || e.last_name) AS label,
        l.leave_type || ' · ' || l.start_date || ' · ' || l.approval_status AS detail,
        '/leaves?request=' || l.id AS href
      FROM leave_requests_view l
      LEFT JOIN employee_directory_view e ON e.employee_id = l.employee_id
      WHERE LOWER(l.id || ' ' || l.employee_id || ' ' || COALESCE(e.first_name, '') ||
        ' ' || COALESCE(e.last_name, '') || ' ' || l.leave_type || ' ' ||
        l.approval_status || ' ' || l.department) LIKE ?
      ORDER BY l.updated_at DESC
      LIMIT 5
    `).bind(pattern).all<SearchRow>(),
    database.prepare(`
      SELECT t.id, t.training_program AS label,
        TRIM(COALESCE(NULLIF(e.preferred_name, ''), e.first_name) || ' ' || e.last_name) ||
          ' · ' || t.completion_status AS detail,
        '/courses?q=' || REPLACE(t.training_program, ' ', '+') AS href
      FROM learning_assignments_view t
      LEFT JOIN employee_directory_view e ON e.employee_id = t.employee_id
      WHERE LOWER(t.id || ' ' || t.training_program || ' ' || t.employee_id ||
        ' ' || COALESCE(e.first_name, '') || ' ' || COALESCE(e.last_name, '') ||
        ' ' || t.completion_status || ' ' || t.department) LIKE ?
      ORDER BY t.updated_at DESC
      LIMIT 5
    `).bind(pattern).all<SearchRow>(),
    database.prepare(`
      SELECT id, title AS label,
        type || ' · ' || status || ' · ' || COALESCE(next_action, '') AS detail,
        '/inbox?item=' || id AS href
      FROM workflow_requests
      WHERE LOWER(id || ' ' || title || ' ' || type || ' ' || status || ' ' ||
        COALESCE(next_action, '') || ' ' || COALESCE(owner_email, '') ||
        ' ' || COALESCE(employee_id, '')) LIKE ?
        AND (? IN ('admin', 'hr') OR LOWER(COALESCE(owner_email, requested_by_email)) = ?)
      ORDER BY CASE LOWER(status) WHEN 'pending' THEN 0 WHEN 'requested' THEN 0 WHEN 'assigned' THEN 1 ELSE 2 END,
        updated_at DESC
      LIMIT 5
    `).bind(pattern, actor.role, actor.email.toLowerCase()).all<SearchRow>(),
  ])

  const mapRows = (
    rows: SearchRow[] | undefined,
    section: GlobalSearchResult["section"],
    kind: GlobalSearchResult["kind"] = "record",
  ): GlobalSearchResult[] => (rows ?? []).map((row) => ({
    id: `${section.toLowerCase()}-${row.id}`,
    href: row.href,
    label: row.label || row.id,
    detail: row.detail,
    section,
    kind,
    initials: kind === "person" ? initials(row.label || row.id) : undefined,
  }))

  return [
    ...mapRows(people.results, "People", "person"),
    ...mapRows(requisitions.results, "Onboarding"),
    ...mapRows(candidates.results, "Onboarding"),
    ...mapRows(leave.results, "Leaves"),
    ...mapRows(learning.results, "Learning"),
    ...mapRows(work.results, "Work"),
  ].slice(0, 25)
}
