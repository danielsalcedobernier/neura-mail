import { NextRequest } from 'next/server'
import sql from '@/lib/db'
import { ok, error } from '@/lib/api'

function validateCronRequest(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: NextRequest) {
  if (!validateCronRequest(request)) return error('Unauthorized', 401)

  try {
    // Only run once per day — skip if already ran today
    const job = await sql`
      SELECT last_run_at FROM cron_jobs WHERE name = 'generate_daily_stats' LIMIT 1
    `
    const lastRun = job[0]?.last_run_at
    const todayMidnight = new Date(new Date().setHours(0, 0, 0, 0))
    if (lastRun && new Date(lastRun) >= todayMidnight) {
      console.log('[cron/generate_daily_stats] Already ran today — skipping')
      return ok({ skipped: true, reason: 'Already ran today' })
    }

    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const date = yesterday.toISOString().split('T')[0]

    await sql`
      INSERT INTO daily_stats (date, total_verifications, total_sends, new_users, revenue_usd)
      SELECT
        ${date}::date,
        COALESCE((SELECT COUNT(*) FROM verification_job_items WHERE DATE(created_at) = ${date}::date), 0),
        COALESCE((SELECT COUNT(*) FROM campaign_recipients WHERE status = 'sent' AND DATE(sent_at) = ${date}::date), 0),
        COALESCE((SELECT COUNT(*) FROM users WHERE DATE(created_at) = ${date}::date), 0),
        COALESCE((SELECT SUM(amount) FROM credit_transactions WHERE type = 'purchase' AND DATE(created_at) = ${date}::date), 0)
      ON CONFLICT (date) DO UPDATE SET
        total_verifications = EXCLUDED.total_verifications,
        total_sends         = EXCLUDED.total_sends,
        new_users           = EXCLUDED.new_users,
        revenue_usd         = EXCLUDED.revenue_usd
    `
    console.log(`[cron/generate_daily_stats] Stats generated for ${date}`)

    await sql`
      UPDATE cron_jobs SET last_run_at = NOW(), last_run_status = 'success', run_count = run_count + 1
      WHERE name = 'generate_daily_stats'
    `

    return ok({ generated: date })
  } catch (e) {
    console.error('[cron/generate_daily_stats]', e)
    await sql`
      UPDATE cron_jobs SET last_run_at = NOW(), last_run_status = 'error', run_count = run_count + 1
      WHERE name = 'generate_daily_stats'
    `.catch(() => {})
    return error('generate_daily_stats failed', 500)
  }
}
