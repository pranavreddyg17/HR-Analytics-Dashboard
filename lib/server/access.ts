import { ensureHrDatabase, getHrDatabase, type Database } from "@/lib/server/hr-database"

export const roles = ["admin", "hr", "manager", "viewer"] as const
export type AppRole = (typeof roles)[number]
export type AccessUser = { email: string; display_name: string; role: AppRole; status: "active" | "disabled"; created_at: string; updated_at: string; last_login_at: string | null }
export const ownerEmail = "pranavreddyg17@gmail.com"

function normalizedEmail(value: string) { return value.trim().toLowerCase() }
function validRole(value: string): value is AppRole { return roles.includes(value as AppRole) }

async function database(): Promise<Database> {
  const db = await ensureHrDatabase()
  if (!db) throw new Error("DATABASE_UNAVAILABLE")
  return db
}

async function accessTable<T>(operation: (db: Database) => Promise<T>): Promise<T> {
  const direct = getHrDatabase()
  if (!direct) throw new Error("DATABASE_UNAVAILABLE")
  try {
    return await operation(direct)
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
    if (!message.includes("no such table") || !message.includes("app_users")) throw error
    return operation(await database())
  }
}

export async function findAccessUser(email: string): Promise<AccessUser | null> {
  return accessTable((db) => db.prepare("SELECT email, display_name, role, status, created_at, updated_at, last_login_at FROM app_users WHERE email = ?")
    .bind(normalizedEmail(email)).first<AccessUser>())
}

export async function recordLogin(email: string, displayName: string) {
  await accessTable((db) => db.prepare("UPDATE app_users SET display_name = CASE WHEN ? = '' THEN display_name ELSE ? END, last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE email = ?")
    .bind(displayName, displayName, normalizedEmail(email)).run())
}

export async function listAccessUsers(): Promise<AccessUser[]> {
  const db = await database()
  const result = await db.prepare("SELECT email, display_name, role, status, created_at, updated_at, last_login_at FROM app_users ORDER BY CASE role WHEN 'admin' THEN 0 WHEN 'hr' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END, email").all<AccessUser>()
  return result.results ?? []
}

export async function addAccessUser(input: { email: string; displayName?: string; role: string }, actor: string) {
  const email = normalizedEmail(input.email)
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("INVALID_EMAIL")
  if (!validRole(input.role)) throw new Error("INVALID_ROLE")
  const db = await database()
  await db.batch([
    db.prepare("INSERT INTO app_users(email, display_name, role, status, invited_by, updated_at) VALUES (?, ?, ?, 'active', ?, CURRENT_TIMESTAMP) ON CONFLICT(email) DO UPDATE SET display_name=excluded.display_name, role=excluded.role, status='active', updated_at=CURRENT_TIMESTAMP").bind(email, input.displayName?.trim() ?? "", input.role, actor),
    db.prepare("INSERT INTO access_audit(id, actor_email, action, target_email, details_json) VALUES (?, ?, 'access_granted', ?, ?)").bind(crypto.randomUUID(), actor, email, JSON.stringify({ role: input.role })),
  ])
  return findAccessUser(email)
}

export async function updateAccessUser(emailValue: string, input: { role?: string; status?: string }, actor: string) {
  const email = normalizedEmail(emailValue)
  if (email === ownerEmail && (input.role && input.role !== "admin" || input.status === "disabled")) throw new Error("OWNER_PROTECTED")
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
  if (email === ownerEmail) throw new Error("OWNER_PROTECTED")
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
