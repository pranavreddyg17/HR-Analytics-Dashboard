import { ensureHrDatabase } from "@/lib/server/hr-repository"
import type { RequestActor } from "@/lib/server/request-user"

export type HomeSnapshot = {
  generatedAt: string
  activeEmployees: number
  awayToday: number
  activeRequisitions: number
  offers: number
  upcoming: Array<{
    id: string
    date: string
    title: string
    detail: string
    href: string
  }>
}

type CountRow = { count: number }
type UpcomingRow = { id: string; event_date: string; title: string; detail: string; href: string }

export async function getHomeSnapshot(_actor: RequestActor): Promise<HomeSnapshot> {
  const database = await ensureHrDatabase()
  if (!database) throw new Error("DATABASE_UNAVAILABLE")
  const today = new Date().toISOString().slice(0, 10)
  const end = new Date(`${today}T12:00:00Z`)
  end.setUTCDate(end.getUTCDate() + 30)
  const through = end.toISOString().slice(0, 10)

  const [activeEmployees, awayToday, requisitions, starts, leave, learning] = await Promise.all([
    database.prepare("SELECT COUNT(*) AS count FROM employee_directory_view WHERE archived_at IS NULL AND LOWER(employment_status) IN ('active', 'on leave')")
      .first<CountRow>(),
    database.prepare("SELECT COUNT(DISTINCT employee_id) AS count FROM leave_requests_view WHERE LOWER(approval_status)='approved' AND start_date<=CAST(? AS TEXT) AND end_date>=CAST(? AS TEXT)")
      .bind(today, today).first<CountRow>(),
    database.prepare("SELECT LOWER(recruitment_status) AS status, COUNT(*) AS count FROM hiring_requisitions_view WHERE LOWER(recruitment_status) IN ('requested', 'approved', 'open', 'offer') GROUP BY LOWER(recruitment_status)")
      .all<{ status: string; count: number }>(),
    database.prepare(`
      SELECT employee_id AS id, hire_date AS event_date,
        TRIM(COALESCE(NULLIF(preferred_name, ''), first_name) || ' ' || last_name) || ' starts' AS title,
        job_title || ' · ' || department AS detail,
        '/people/' || employee_id AS href
      FROM employee_directory_view
      WHERE archived_at IS NULL AND hire_date BETWEEN CAST(? AS TEXT) AND CAST(? AS TEXT)
      ORDER BY hire_date, employee_id LIMIT 8
    `).bind(today, through).all<UpcomingRow>(),
    database.prepare(`
      SELECT l.id, l.start_date AS event_date, l.leave_type || ' leave begins' AS title,
        TRIM(COALESCE(NULLIF(e.preferred_name, ''), e.first_name) || ' ' || e.last_name) || ' · ' || e.department AS detail,
        '/leaves?request=' || l.id AS href
      FROM leave_requests_view l
      JOIN employee_directory_view e ON e.employee_id=l.employee_id
      WHERE LOWER(l.approval_status)='approved' AND l.start_date BETWEEN CAST(? AS TEXT) AND CAST(? AS TEXT)
      ORDER BY l.start_date, l.id LIMIT 8
    `).bind(today, through).all<UpcomingRow>(),
    database.prepare(`
      SELECT a.id, a.due_date AS event_date, c.title || ' due' AS title,
        TRIM(COALESCE(NULLIF(e.preferred_name, ''), e.first_name) || ' ' || e.last_name) AS detail,
        '/courses?assignment=' || a.id AS href
      FROM course_assignments a
      JOIN learning_courses c ON c.id=a.course_id
      JOIN employee_directory_view e ON e.employee_id=a.employee_id
      WHERE c.is_mandatory=1 AND LOWER(a.status)<>'completed' AND a.due_date BETWEEN CAST(? AS TEXT) AND CAST(? AS TEXT)
      ORDER BY a.due_date, a.id LIMIT 8
    `).bind(today, through).all<UpcomingRow>(),
  ])

  const requisitionRows = requisitions.results ?? []
  const upcoming = [
    ...(starts.results ?? []),
    ...(leave.results ?? []),
    ...(learning.results ?? []),
  ].sort((left, right) => left.event_date.localeCompare(right.event_date) || left.id.localeCompare(right.id)).slice(0, 6)

  return {
    generatedAt: new Date().toISOString(),
    activeEmployees: Number(activeEmployees?.count ?? 0),
    awayToday: Number(awayToday?.count ?? 0),
    activeRequisitions: requisitionRows.reduce((sum, row) => sum + Number(row.count), 0),
    offers: requisitionRows.find((row) => row.status === "offer")?.count ?? 0,
    upcoming: upcoming.map((row) => ({ id: row.id, date: row.event_date, title: row.title, detail: row.detail, href: row.href })),
  }
}
