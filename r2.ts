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

  const result = await withCronLock('retry_failed_sends', async () => {
    // Re-queue failed sends that have fewer than 3 attempts and waited at least 5 minutes
    const retried = await sql`
      UPDATE sending_queue
      SET status = 'pending', scheduled_at = NOW() + INTERVAL '5 minutes'
      WHERE status = 'failed'
        AND attempts < 3
        AND locked_at < NOW() - INTERVAL '5 minutes'
      RETURNING id
    `
    console.log(`[cron/retry_failed_sends] Re-queued ${retried.length} item(s)`)

    await sql`
      UPDATE cron_jobs SET last_run_at = NOW(), last_run_status = 'success', run_count = run_count + 1
      WHERE name = 'retry_failed_sends'
    `

    return { retried: retried.length }
  })

  if (!result.ran) return ok({ skipped: true })
  if (result.error) return error(result.error, 500)
  return ok(result.result)
}
