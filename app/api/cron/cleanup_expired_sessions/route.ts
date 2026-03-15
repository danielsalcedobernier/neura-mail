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
      DELETE FROM sessions WHERE expires_at < NOW() RETURNING id
    `
    console.log(`[cron/cleanup_expired_sessions] Deleted ${deleted.length} expired sessions`)

    await sql`
      UPDATE cron_jobs SET last_run_at = NOW(), last_run_status = 'success', run_count = run_count + 1
      WHERE name = 'cleanup_expired_sessions'
    `

    return ok({ deleted: deleted.length })
  } catch (e) {
    console.error('[cron/cleanup_expired_sessions]', e)
    await sql`
      UPDATE cron_jobs SET last_run_at = NOW(), last_run_status = 'error', run_count = run_count + 1
      WHERE name = 'cleanup_expired_sessions'
    `.catch(() => {})
    return error('cleanup_expired_sessions failed', 500)
  }
}
