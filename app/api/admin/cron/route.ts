import { requireAdmin } from '@/lib/auth'
import sql from '@/lib/db'
import { ok, error } from '@/lib/api'

export async function GET() {
  try {
    await requireAdmin()
    const jobs = await sql`
      SELECT id, name, is_running, last_run_at, last_run_status,
             last_run_duration_ms, last_error, run_count
      FROM cron_jobs ORDER BY name ASC
    `
    return ok(jobs)
  } catch (err) {
    if (err instanceof Error && (err.message === 'UNAUTHORIZED' || err.message === 'FORBIDDEN')) {
      return error(err.message, err.message === 'UNAUTHORIZED' ? 401 : 403)
    }
    return error('Failed to fetch cron jobs', 500)
  }
}
