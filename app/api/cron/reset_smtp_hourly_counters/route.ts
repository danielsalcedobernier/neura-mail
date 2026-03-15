export const maxDuration = 300

import { NextRequest } from 'next/server'
import sql from '@/lib/db'
import { withCronLock } from '@/lib/cron'
import { ok, error } from '@/lib/api'

function validateCronRequest(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: NextRequest) {
  if (!validateCronRequest(request)) return error('Unauthorized', 401)

  const result = await withCronLock('reset_smtp_hourly_counters', async () => {
    const reset = await sql`
      UPDATE smtp_servers
      SET sent_this_hour = 0, hour_reset_at = NOW() + INTERVAL '1 hour'
      WHERE hour_reset_at IS NOT NULL AND hour_reset_at < NOW()
      RETURNING id
    `
    console.log(`[cron/reset_smtp_hourly_counters] Reset ${reset.length} server(s)`)

    await sql`
      UPDATE cron_jobs SET last_run_at = NOW(), last_run_status = 'success', run_count = run_count + 1
      WHERE name = 'reset_smtp_hourly_counters'
    `

    return { reset: reset.length }
  })

  if (!result.ran) return ok({ skipped: true })
  if (result.error) return error(result.error, 500)
  return ok(result.result)
}
