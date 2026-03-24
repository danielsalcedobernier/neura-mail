import { getSession } from '@/lib/auth'
import sql from '@/lib/db'
import { ok, unauthorized } from '@/lib/api'

export async function GET() {
  const session = await getSession()
  if (!session) return unauthorized()

  const rows = await sql`
    SELECT id, email, full_name, role, is_active, email_verified, created_at,
           (role = 'admin') as is_admin
    FROM users WHERE id = ${session.id}
  `
  return ok(rows[0] || null)
}
