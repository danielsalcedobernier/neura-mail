import { NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { ok, forbidden } from '@/lib/api'
import sql from '@/lib/db'

export async function GET(req: NextRequest) {
  try { await requireAdmin() } catch { return forbidden() }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') ?? 'completed'

  const rows = await sql`
    SELECT
      vj.id,
      vj.list_id,
      vj.status,
      vj.created_at,
      el.name        AS list_name,
      el.total_count,
      u.email        AS user_email
    FROM verification_jobs vj
    LEFT JOIN email_lists el ON el.id = vj.list_id
    LEFT JOIN users u ON u.id = el.user_id
    WHERE vj.status = ${status}
    ORDER BY vj.created_at DESC
  `
  return ok(rows)
}
