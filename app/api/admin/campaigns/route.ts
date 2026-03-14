import { requireAdmin } from '@/lib/auth'
import sql from '@/lib/db'
import { ok, forbidden } from '@/lib/api'

export async function GET() {
  try { await requireAdmin() } catch { return forbidden() }

  const campaigns = await sql`
    SELECT
      c.id, c.name, c.subject, c.status,
      c.total_recipients, c.sent_count, c.delivered_count,
      c.opened_count, c.clicked_count, c.bounced_count, c.failed_count,
      c.created_at, c.scheduled_at, c.completed_at,
      u.email AS user_email, u.full_name AS user_name
    FROM campaigns c
    LEFT JOIN users u ON u.id = c.user_id
    ORDER BY c.created_at DESC
    LIMIT 200
  `
  return ok(campaigns)
}
