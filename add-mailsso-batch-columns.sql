import { NextRequest } from 'next/server'
import sql from '@/lib/db'
import { ok, error } from '@/lib/api'

export const maxDuration = 30

function validateCronRequest(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: NextRequest) {
  if (!validateCronRequest(request)) return error('Unauthorized', 401)

  try {
    // Find active verification jobs
    const activeJobs = await sql`
      SELECT id FROM verification_jobs WHERE status IN ('running', 'queued', 'seeding', 'cache_sweeping')
    `

    if (activeJobs.length === 0) {
      console.log('[cron/sync_verification_progress] No active jobs')
      return ok({ updated: 0 })
    }

    let updated = 0
    for (const job of activeJobs) {
      const jobId = job.id as string

      // Count from verification_job_items in a single query
      const counters = await sql`
        SELECT
          COUNT(*) FILTER (WHERE result IS NOT NULL)   AS processed_emails,
          COUNT(*) FILTER (WHERE result = 'valid')     AS valid_count,
          COUNT(*) FILTER (WHERE result = 'invalid')   AS invalid_count,
          COUNT(*) FILTER (WHERE result = 'risky')     AS risky_count,
          COUNT(*) FILTER (WHERE result = 'catch_all') AS catch_all_count,
          COUNT(*) FILTER (WHERE result = 'unknown')   AS unknown_count,
          COUNT(*) FILTER (WHERE from_cache = true)    AS cache_hit_count,
          COALESCE(SUM(credits_charged), 0)            AS credits_used
        FROM verification_job_items
        WHERE job_id = ${jobId}
      `
      const c = counters[0]

      // Update with literal values to avoid Neon $1 param issues
      await sql`
        UPDATE verification_jobs SET
          processed_emails = ${Number(c.processed_emails)},
          valid_count      = ${Number(c.valid_count)},
          invalid_count    = ${Number(c.invalid_count)},
          risky_count      = ${Number(c.risky_count)},
          catch_all_count  = ${Number(c.catch_all_count)},
          unknown_count    = ${Number(c.unknown_count)},
          cache_hit_count  = ${Number(c.cache_hit_count)},
          credits_used     = ${Number(c.credits_used)},
          updated_at       = NOW()
        WHERE id = ${jobId}
      `
      updated++
    }

    console.log(`[cron/sync_verification_progress] Updated ${updated} active jobs`)
    return ok({ updated })
  } catch (e) {
    console.error('[cron/sync_verification_progress]', e)
    return error('sync_verification_progress failed', 500)
  }
}
