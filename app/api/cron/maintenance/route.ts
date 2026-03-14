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

  const results: Record<string, unknown> = {}

  try {
    // 1. Delete expired sessions
    const expiredSessions = await sql`
      DELETE FROM sessions WHERE expires_at < NOW() RETURNING id
    `
    results.expiredSessions = expiredSessions.length

    // 2. Clean expired global email cache
    const expiredCache = await sql`
      DELETE FROM global_email_cache WHERE expires_at < NOW() RETURNING email
    `
    results.expiredCache = expiredCache.length

    // 3. Expire user plans
    await sql`
      UPDATE user_plans SET status = 'expired'
      WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at < NOW()
    `

    // 4. Reset SMTP hourly counters
    await sql`
      UPDATE smtp_servers SET sent_this_hour = 0, hour_reset_at = NOW() + INTERVAL '1 hour'
      WHERE hour_reset_at IS NOT NULL AND hour_reset_at < NOW()
    `

    // 5. Reset SMTP daily counters
    await sql`
      UPDATE smtp_servers SET sent_today = 0, day_reset_at = NOW() + INTERVAL '1 day'
      WHERE day_reset_at IS NOT NULL AND day_reset_at < NOW()
    `

    // 6. Start scheduled campaigns
    const scheduled = await sql`
      UPDATE campaigns SET status = 'running', started_at = NOW()
      WHERE status = 'scheduled' AND scheduled_at <= NOW()
      RETURNING id
    `
    results.scheduledCampaigns = scheduled.length

    // 7. Retry failed sends (up to 3 attempts, wait 5 min between)
    await sql`
      UPDATE sending_queue SET status = 'pending', scheduled_at = NOW() + INTERVAL '5 minutes'
      WHERE status = 'failed' AND attempts < 3
        AND locked_at < NOW() - INTERVAL '5 minutes'
    `

    await sql`
      UPDATE cron_jobs SET last_run_at = NOW(), last_run_status = 'success', run_count = run_count + 1
      WHERE name IN (
        'cleanup_expired_sessions', 'cleanup_expired_cache', 'expire_user_plans',
        'reset_smtp_hourly_counters', 'reset_smtp_daily_counters',
        'send_campaign_scheduled', 'retry_failed_sends'
      )
    `

    return ok(results)
  } catch (e) {
    console.error('[cron/maintenance]', e)
    return error('Maintenance tasks failed', 500)
  }
}
