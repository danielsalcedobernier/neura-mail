import { requireWorkerOrAdmin } from '@/lib/auth'
import { ok, forbidden, serverError } from '@/lib/api'
import sql from '@/lib/db'

export async function GET() {
  try { await requireWorkerOrAdmin() } catch { return forbidden() }
  try {
    const jobs = await sql`
      SELECT
        vj.id,
        vj.status,
        vj.mailsso_batch_id,
        vj.mailsso_batch_submitted_at,
        vj.created_at,
        el.name AS list_name,
        el.id   AS list_id,
        (SELECT COUNT(*) FROM verification_job_items WHERE job_id = vj.id)                          AS total_count,
        (SELECT COUNT(*) FROM verification_job_items WHERE job_id = vj.id AND status = 'pending')   AS pending_count,
        (SELECT COUNT(*) FROM verification_job_items WHERE job_id = vj.id AND status = 'processing') AS processing_count,
        (SELECT COUNT(*) FROM verification_job_items WHERE job_id = vj.id AND status = 'completed') AS completed_count
      FROM verification_jobs vj
      LEFT JOIN email_lists el ON el.id = vj.list_id
      WHERE vj.status IN ('queued', 'running', 'completed')
      ORDER BY vj.created_at DESC
      LIMIT 50
    `
    return ok(jobs)
  } catch (e) {
    return serverError(e)
  }
}
