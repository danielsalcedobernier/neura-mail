import { NextRequest } from 'next/server'
import { getSession } from '@/lib/auth'
import sql from '@/lib/db'
import { ok, error, unauthorized, notFound } from '@/lib/api'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return unauthorized()
  const { id } = await params

  const jobs = await sql`
    SELECT vj.*, el.name as list_name
    FROM verification_jobs vj
    LEFT JOIN email_lists el ON el.id = vj.list_id
    WHERE vj.id = ${id} AND vj.user_id = ${session.id}
  `
  if (!jobs[0]) return notFound('Verification job')
  return ok(jobs[0])
}

// Pause or resume a job
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return unauthorized()
  const { id } = await params
  const body = await request.json()
  const action = body.action as 'pause' | 'resume'

  if (action === 'pause') {
    // Debug: check what job actually exists for this id
    const existing = await sql`SELECT id, user_id, status FROM verification_jobs WHERE id = ${id}`
    console.log('[v0] pause attempt - job id:', id, 'session user_id:', session.id, 'existing:', JSON.stringify(existing[0] ?? null))

    const rows = await sql`
      UPDATE verification_jobs SET status = 'paused'
      WHERE id = ${id} AND user_id = ${session.id}
        AND status IN ('queued', 'running', 'seeding', 'cache_sweeping')
      RETURNING id, status
    `
    if (!rows[0]) return notFound('Verification job')
    console.log(`[verification PATCH] Paused job=${id}`)
    return ok({ paused: true, id })
  }

  if (action === 'resume') {
    // Allow resuming paused OR failed jobs
    // Clear mailsso_batch_id so the cron doesn't try to poll an expired/failed batch
    const rows = await sql`
      UPDATE verification_jobs
      SET status = 'queued',
          next_run_at = NOW(),
          mailsso_batch_id = NULL,
          mailsso_batch_submitted_at = NULL
      WHERE id = ${id} AND user_id = ${session.id}
        AND status IN ('paused', 'failed')
      RETURNING id, status
    `
    if (!rows[0]) return notFound('Verification job')

    // Reset any stuck 'processing' items back to 'pending' so they get picked up again
    await sql`
      UPDATE verification_job_items SET status = 'pending'
      WHERE job_id = ${id} AND status = 'processing'
    `

    return ok({ resumed: true, id })
  }

  return error('Invalid action. Use pause or resume.', 400)
}

// Cancel a running job
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return unauthorized()
  const { id } = await params

  const rows = await sql`
    UPDATE verification_jobs
    SET status = 'cancelled'
    WHERE id = ${id} AND user_id = ${session.id}
      AND status IN ('queued', 'running', 'paused', 'failed')
    RETURNING id
  `
  if (!rows[0]) return notFound('Verification job')

  // Refund only the emails that were never processed (pending + processing)
  // These are the items that consumed a credit reservation but got no result
  const pending = await sql`
    SELECT COUNT(*) AS count FROM verification_job_items
    WHERE job_id = ${id} AND status IN ('pending', 'processing')
  `
  const refund = Number(pending[0].count)
  if (refund > 0) {
    await sql`
      UPDATE user_credits SET balance = balance + ${refund}, updated_at = NOW()
      WHERE user_id = ${session.id}
    `
    // Mark those items as cancelled so counts stay accurate
    await sql`
      UPDATE verification_job_items SET status = 'cancelled'
      WHERE job_id = ${id} AND status IN ('pending', 'processing')
    `
  }
  return ok({ cancelled: true, creditsRefunded: refund })
}
