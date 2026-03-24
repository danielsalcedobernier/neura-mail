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
    const deleted = await sql`
      DELETE FROM global_email_cache WHERE expires_at < NOW() RETURNING email
    `
    console.log(`[cron/cleanup_expired_cache] Deleted ${deleted.length} expired cache entries`)

    await sql`
      UPDATE cron_jobs SET last_run_at = NOW(), last_run_status = 'success', run_count = run_count + 1
      WHERE name = 'cleanup_expired_cache'
    `

    return ok({ deleted: deleted.length })
  } catch (e) {
    console.error('[cron/cleanup_expired_cache]', e)
    await sql`
      UPDATE cron_jobs SET last_run_at = NOW(), last_run_status = 'error', run_count = run_count + 1
      WHERE name = 'cleanup_expired_cache'
    `.catch(() => {})
    return error('cleanup_expired_cache failed', 500)
  }
}
