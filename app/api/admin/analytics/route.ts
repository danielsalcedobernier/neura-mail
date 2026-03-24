import { requireAdmin } from '@/lib/auth'
import sql from '@/lib/db'
import { ok, error } from '@/lib/api'

export async function GET() {
  try {
    await requireAdmin()

    const [users, sent, verified, orders, cache, verSplit] = await Promise.all([
      sql`SELECT COUNT(*) as total_users FROM users`,
      sql`SELECT COALESCE(SUM(sent_count), 0) as total_sent FROM campaigns`,
      sql`SELECT COUNT(*) as total_verified FROM verification_job_items WHERE status = 'completed'`,
      sql`SELECT COALESCE(SUM(amount), 0) as total_revenue FROM paypal_orders WHERE status = 'completed'`,
      sql`SELECT COUNT(*) as cache_hits FROM global_email_cache WHERE hit_count > 0`,
      sql`
        SELECT
          COUNT(*) FILTER (WHERE verification_status = 'valid') as valid_count,
          COUNT(*) FILTER (WHERE verification_status = 'invalid') as invalid_count,
          COUNT(*) FILTER (WHERE verification_status = 'risky') as risky_count,
          COUNT(*) FILTER (WHERE verification_status = 'unknown') as unknown_count
        FROM global_email_cache
      `,
    ])

    const userGrowth = await sql`
      SELECT TO_CHAR(created_at, 'Mon YY') as month, COUNT(*) as users
      FROM users
      WHERE created_at > NOW() - INTERVAL '6 months'
      GROUP BY TO_CHAR(created_at, 'Mon YY'), DATE_TRUNC('month', created_at)
      ORDER BY DATE_TRUNC('month', created_at) ASC
    `

    const revenueByMonth = await sql`
      SELECT TO_CHAR(created_at, 'Mon YY') as month, COALESCE(SUM(amount), 0) as revenue
      FROM paypal_orders
      WHERE status = 'completed' AND created_at > NOW() - INTERVAL '6 months'
      GROUP BY TO_CHAR(created_at, 'Mon YY'), DATE_TRUNC('month', created_at)
      ORDER BY DATE_TRUNC('month', created_at) ASC
    `

    return ok({
      total_users: Number(users[0]?.total_users ?? 0),
      total_sent: Number(sent[0]?.total_sent ?? 0),
      total_verified: Number(verified[0]?.total_verified ?? 0),
      total_revenue: Number(orders[0]?.total_revenue ?? 0),
      cache_hits: Number(cache[0]?.cache_hits ?? 0),
      valid_count: Number(verSplit[0]?.valid_count ?? 0),
      invalid_count: Number(verSplit[0]?.invalid_count ?? 0),
      risky_count: Number(verSplit[0]?.risky_count ?? 0),
      unknown_count: Number(verSplit[0]?.unknown_count ?? 0),
      user_growth: userGrowth,
      revenue_by_month: revenueByMonth,
    })
  } catch (err) {
    if (err instanceof Error && (err.message === 'UNAUTHORIZED' || err.message === 'FORBIDDEN')) {
      return error(err.message, err.message === 'UNAUTHORIZED' ? 401 : 403)
    }
    console.error('[admin/analytics]', err)
    return error('Failed to load analytics', 500)
  }
}
