import { ensureHrDatabase, type Database } from "@/lib/server/hr-repository"
import { runtimeEnv } from "@/lib/server/runtime-env"

const roles = ["admin", "hr", "manager", "viewer", "employee"] as const
export type AppRole = (typeof roles)[number]
type AccessUser = { email: string; display_name: string; role: AppRole; status: "active" | "disabled"; created_at: string; updated_at: string; last_login_at: string | null }
const ownerEmail = runtimeEnv.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase() ?? ""

function normalizedEmail(value: string) { return value.trim().toLowerCase() }
function validRole(value: string): value is AppRole { return roles.includes(value as AppRole) }

async function database(): Promise<Database> {
  const db = await ensureHrDatabase()
  if (!db) throw new Error("DATABASE_UNAVAILABLE")
  return db
}

async function accessTable<T>(operation: (db: Database) => Promise<T>): Promise<T> {
  return operation(await database())
}

export async function findAccessUser(email: string): Promise<AccessUser | null> {
  return accessTable((db) => db.prepare("SELECT email, display_name, role, status, created_at, updated_at, last_login_at FROM app_users WHERE email = ?")
    .bind(normalizedEmail(email)).first<AccessUser>())
}

export async function recordLogin(email: string, displayName: string) {
  await accessTable((db) => db.prepare("UPDATE app_users SET display_name = CASE WHEN ? = '' THEN display_name ELSE ? END, employee_id = COALESCE(employee_id, (SELECT employee_id FROM employees WHERE LOWER(work_email)=LOWER(?) AND archived_at IS NULL LIMIT 1)), onboarding_status = CASE WHEN COALESCE(employee_id, (SELECT employee_id FROM employees WHERE LOWER(work_email)=LOWER(?) AND archived_at IS NULL LIMIT 1)) IS NULL THEN onboarding_status ELSE 'complete' END, last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE email = ?")
    .bind(displayName, displayName, normalizedEmail(email), normalizedEmail(email), normalizedEmail(email)).run())
}

/** Provision a verified Google identity for employee self-service without granting HR access. */
export async function ensureEmployeeAccessUser(emailValue: string, displayName: string): Promise<AccessUser> {
  const email = normalizedEmail(emailValue)
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("INVALID_EMAIL")
  const db = await database()
  await db.prepare(`
    INSERT INTO app_users(email, display_name, role, status, invited_by, employee_id, organization_id, onboarding_status, updated_at)
    VALUES (?, ?, 'employee', 'active', 'employee-self-service',
      (SELECT employee_id FROM employees WHERE LOWER(work_email)=LOWER(?) AND archived_at IS NULL LIMIT 1),
      'org:laidbackhr',
      CASE WHEN EXISTS (SELECT 1 FROM employees WHERE LOWER(work_email)=LOWER(?) AND archived_at IS NULL) THEN 'complete' ELSE 'required' END,
      CURRENT_TIMESTAMP)
    ON CONFLICT(email) DO NOTHING
  `).bind(email, displayName.trim(), email, email).run()
  const user = await findAccessUser(email)
  if (!user) throw new Error("ACCESS_PROVISIONING_FAILED")
  return user
}

export async function listAccessUsers(): Promise<AccessUser[]> {
  const db = await database()
  const result = await db.prepare("SELECT email, display_name, role, status, created_at, updated_at, last_login_at FROM app_users ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'hr' THEN 1 WHEN 'manager' THEN 2 WHEN 'viewer' THEN 3 ELSE 4 END, email").all<AccessUser>()
  return result.results ?? []
}

export async function addAccessUser(input: { email: string; displayName?: string; role: string }, actor: string) {
  const email = normalizedEmail(input.email)
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("INVALID_EMAIL")
  if (!validRole(input.role)) throw new Error("INVALID_ROLE")
  const db = await database()
  const upsert = db.prepare("INSERT INTO app_users(email, display_name, role, status, invited_by, employee_id, onboarding_status, updated_at) VALUES (?, ?, ?, 'active', ?, (SELECT employee_id FROM employees WHERE LOWER(work_email)=LOWER(?) AND archived_at IS NULL LIMIT 1), CASE WHEN EXISTS (SELECT 1 FROM employees WHERE LOWER(work_email)=LOWER(?) AND archived_at IS NULL) THEN 'complete' ELSE 'not_required' END, CURRENT_TIMESTAMP) ON CONFLICT(email) DO UPDATE SET display_name=excluded.display_name, role=excluded.role, status='active', employee_id=COALESCE(app_users.employee_id, excluded.employee_id), onboarding_status=CASE WHEN COALESCE(app_users.employee_id, excluded.employee_id) IS NULL THEN app_users.onboarding_status ELSE 'complete' END, updated_at=CURRENT_TIMESTAMP")
    .bind(email, input.displayName?.trim() ?? "", input.role, actor, email, email)
  await db.batch([
    upsert,
    db.prepare("INSERT INTO access_audit(id, actor_email, action, target_email, details_json) VALUES (?, ?, 'access_granted', ?, ?)").bind(crypto.randomUUID(), actor, email, JSON.stringify({ role: input.role })),
  ])
  return findAccessUser(email)
}

export async function updateAccessUser(emailValue: string, input: { role?: string; status?: string }, actor: string) {
  const email = normalizedEmail(emailValue)
  if (ownerEmail && email === ownerEmail && (input.role && input.role !== "admin" || input.status === "disabled")) throw new Error("OWNER_PROTECTED")
  if (input.role && !validRole(input.role)) throw new Error("INVALID_ROLE")
  if (input.status && !["active", "disabled"].includes(input.status)) throw new Error("INVALID_STATUS")
  const current = await findAccessUser(email)
  if (!current) throw new Error("USER_NOT_FOUND")
  const role = input.role ?? current.role
  const status = input.status ?? current.status
  const db = await database()
  await db.batch([
    db.prepare("UPDATE app_users SET role=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE email=?").bind(role, status, email),
    db.prepare("INSERT INTO access_audit(id, actor_email, action, target_email, details_json) VALUES (?, ?, 'access_updated', ?, ?)").bind(crypto.randomUUID(), actor, email, JSON.stringify({ role, status })),
  ])
  return findAccessUser(email)
}

export async function removeAccessUser(emailValue: string, actor: string) {
  const email = normalizedEmail(emailValue)
  if (ownerEmail && email === ownerEmail) throw new Error("OWNER_PROTECTED")
  const current = await findAccessUser(email)
  if (!current) throw new Error("USER_NOT_FOUND")
  const db = await database()
  await db.batch([
    db.prepare("DELETE FROM app_users WHERE email=?").bind(email),
    db.prepare("INSERT INTO access_audit(id, actor_email, action, target_email, details_json) VALUES (?, ?, 'access_removed', ?, ?)")
      .bind(crypto.randomUUID(), actor, email, JSON.stringify({ previousRole: current.role, previousStatus: current.status })),
  ])
  return { removed: true, email }
}

export async function listAccessAudit() {
  const db = await database()
  const result = await db.prepare("SELECT id, actor_email, action, target_email, details_json, created_at FROM access_audit ORDER BY created_at DESC LIMIT 100").all<Record<string, string>>()
  return result.results ?? []
}
